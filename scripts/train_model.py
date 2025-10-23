#!/usr/bin/env python3
"""Utility script for training text classification models.

The script expects JSON Lines files for the dataset where each line contains a
``text`` field and an integer ``label`` field.  The model configuration is
provided via a JSON file and should at minimum declare ``model_name_or_path``
so that a compatible Hugging Face Transformers model can be instantiated.
"""

import argparse
import json
import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, TypedDict

import torch
from torch.utils.data import DataLoader, Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    PreTrainedModel,
    PreTrainedTokenizerBase,
    get_linear_schedule_with_warmup,
)


LOGGER = logging.getLogger(__name__)


@dataclass
class TrainingConfig:
    """Container for user supplied configuration parameters."""

    model_name_or_path: str
    num_labels: int
    learning_rate: float = 5e-5
    weight_decay: float = 0.0
    num_train_epochs: int = 3
    warmup_steps: int = 0
    per_device_batch_size: int = 8
    gradient_accumulation_steps: int = 1
    max_length: int = 512
    checkpoint_steps: int = 500

    @staticmethod
    def from_dict(data: Mapping[str, Any]) -> "TrainingConfig":
        required_keys = {"model_name_or_path", "num_labels"}
        missing = required_keys - data.keys()
        if missing:
            raise ValueError(f"Missing required config keys: {sorted(missing)}")

        return TrainingConfig(
            model_name_or_path=str(data["model_name_or_path"]),
            num_labels=int(data["num_labels"]),
            learning_rate=float(data.get("learning_rate", 5e-5)),
            weight_decay=float(data.get("weight_decay", 0.0)),
            num_train_epochs=int(data.get("num_train_epochs", 3)),
            warmup_steps=int(data.get("warmup_steps", 0)),
            per_device_batch_size=int(data.get("per_device_batch_size", 8)),
            gradient_accumulation_steps=int(data.get("gradient_accumulation_steps", 1)),
            max_length=int(data.get("max_length", 512)),
            checkpoint_steps=int(data.get("checkpoint_steps", 500)),
        )


class Sample(TypedDict):
    """Single dataset example."""

    text: str
    label: int


Batch = Dict[str, torch.Tensor]


class JsonlTextDataset(Dataset[Sample]):
    """Dataset that reads ``text``/``label`` pairs from a JSON Lines file."""

    def __init__(self, path: Path, label_mapping: Optional[Dict[str, int]] = None) -> None:
        self.samples: List[Sample] = []
        with path.open("r", encoding="utf-8") as file:
            for line_number, line in enumerate(file, start=1):
                if not line.strip():
                    continue
                record = json.loads(line)
                if "text" not in record:
                    raise ValueError(f"Missing 'text' field in {path} line {line_number}")
                text = str(record["text"])
                label = record.get("label")
                if label is None:
                    raise ValueError(f"Missing 'label' field in {path} line {line_number}")
                if isinstance(label, str) and label_mapping is not None:
                    if label not in label_mapping:
                        raise ValueError(
                            f"Label '{label}' not found in label_mapping at line {line_number}"
                        )
                    label = label_mapping[label]
                self.samples.append(Sample(text=text, label=int(label)))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Sample:
        return self.samples[idx]


def collate_batch(
    batch: Sequence[Sample],
    tokenizer: PreTrainedTokenizerBase,
    max_length: int,
) -> Batch:
    texts = [item["text"] for item in batch]
    labels = torch.tensor([item["label"] for item in batch], dtype=torch.long)
    encoded = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=max_length,
        return_tensors="pt",
    )
    batch_tensors: Batch = {key: value for key, value in encoded.items()}
    batch_tensors["labels"] = labels
    return batch_tensors


def save_checkpoint(
    output_dir: Path, step: int, model: PreTrainedModel, tokenizer: PreTrainedTokenizerBase
) -> None:
    checkpoint_dir = output_dir / f"checkpoint-{step}"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(checkpoint_dir)
    tokenizer.save_pretrained(checkpoint_dir)
    LOGGER.info("Saved checkpoint to %s", checkpoint_dir)


def train(
    train_loader: DataLoader,
    eval_loader: Optional[DataLoader],
    model: PreTrainedModel,
    tokenizer: PreTrainedTokenizerBase,
    config: TrainingConfig,
    device: torch.device,
    output_dir: Path,
) -> None:
    num_update_steps_per_epoch = math.ceil(
        len(train_loader) / max(1, config.gradient_accumulation_steps)
    )
    total_training_steps = num_update_steps_per_epoch * config.num_train_epochs

    optimizer = torch.optim.AdamW(
        model.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay
    )
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=config.warmup_steps, num_training_steps=total_training_steps
    )

    global_step = 0
    best_eval_loss: Optional[float] = None

    for epoch in range(config.num_train_epochs):
        LOGGER.info("Starting epoch %s/%s", epoch + 1, config.num_train_epochs)
        model.train()
        running_loss = 0.0

        for step, batch in enumerate(train_loader, start=1):
            batch = {k: v.to(device) for k, v in batch.items()}
            outputs = model(**batch)
            loss = outputs.loss / config.gradient_accumulation_steps
            loss.backward()
            running_loss += loss.item()

            if step % config.gradient_accumulation_steps == 0:
                optimizer.step()
                scheduler.step()
                optimizer.zero_grad(set_to_none=True)
                global_step += 1

                if global_step % config.checkpoint_steps == 0:
                    save_checkpoint(output_dir, global_step, model, tokenizer)

        train_loss = running_loss / max(1, len(train_loader))
        LOGGER.info("Epoch %s training loss: %.4f", epoch + 1, train_loss)

        if eval_loader is not None:
            eval_loss = evaluate(model, eval_loader, device)
            LOGGER.info("Epoch %s validation loss: %.4f", epoch + 1, eval_loss)
            if best_eval_loss is None or eval_loss < best_eval_loss:
                best_eval_loss = eval_loss
                save_checkpoint(output_dir, global_step or (epoch + 1), model, tokenizer)

    LOGGER.info("Training finished, saving final model to %s", output_dir)
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)


def evaluate(model: PreTrainedModel, data_loader: DataLoader, device: torch.device) -> float:
    model.eval()
    total_loss = 0.0
    num_batches = 0
    with torch.no_grad():
        for batch in data_loader:
            batch = {k: v.to(device) for k, v in batch.items()}
            outputs = model(**batch)
            total_loss += outputs.loss.item()
            num_batches += 1
    return total_loss / max(1, num_batches)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a text classification model")
    parser.add_argument("--train-file", type=Path, required=True, help="Path to the training JSONL file")
    parser.add_argument(
        "--validation-file",
        type=Path,
        default=None,
        help="Optional path to the validation JSONL file",
    )
    parser.add_argument(
        "--config",
        type=Path,
        required=True,
        help="Path to the JSON configuration file for the model and optimizer",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Directory where checkpoints and the final model will be stored",
    )
    parser.add_argument(
        "--label-mapping",
        type=Path,
        default=None,
        help="Optional JSON file mapping string labels to integer IDs",
    )
    parser.add_argument(
        "--seed", type=int, default=42, help="Random seed for reproducibility"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cuda" if torch.cuda.is_available() else "cpu",
        help="Device to run training on (e.g., 'cuda' or 'cpu')",
    )
    return parser.parse_args()


def load_label_mapping(path: Optional[Path]) -> Optional[Dict[str, int]]:
    if path is None:
        return None
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    return {str(key): int(value) for key, value in data.items()}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    args = parse_args()

    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    with args.config.open("r", encoding="utf-8") as config_file:
        config_data = json.load(config_file)
    config = TrainingConfig.from_dict(config_data)

    label_mapping = load_label_mapping(args.label_mapping)
    train_dataset = JsonlTextDataset(args.train_file, label_mapping=label_mapping)
    eval_dataset = None
    if args.validation_file is not None:
        eval_dataset = JsonlTextDataset(args.validation_file, label_mapping=label_mapping)

    tokenizer = AutoTokenizer.from_pretrained(config.model_name_or_path)
    if tokenizer.pad_token is None:
        tokenizer.add_special_tokens({"pad_token": "[PAD]"})

    model = AutoModelForSequenceClassification.from_pretrained(
        config.model_name_or_path,
        num_labels=config.num_labels,
    )
    if tokenizer.pad_token_id is not None:
        model.resize_token_embeddings(len(tokenizer))

    device = torch.device(args.device)
    model.to(device)

    train_loader = DataLoader(
        train_dataset,
        batch_size=config.per_device_batch_size,
        shuffle=True,
        collate_fn=lambda batch: collate_batch(batch, tokenizer, config.max_length),
    )
    eval_loader = None
    if eval_dataset is not None:
        eval_loader = DataLoader(
            eval_dataset,
            batch_size=config.per_device_batch_size,
            shuffle=False,
            collate_fn=lambda batch: collate_batch(batch, tokenizer, config.max_length),
        )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    train(train_loader, eval_loader, model, tokenizer, config, device, args.output_dir)


if __name__ == "__main__":
    main()
