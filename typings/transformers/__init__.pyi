from os import PathLike
from typing import Any, Dict, Iterable, Optional

class _ModelOutput:
    loss: Any


class PreTrainedModel:
    def train(self) -> None: ...
    def eval(self) -> None: ...
    def parameters(self) -> Iterable[Any]: ...
    def __call__(self, *args: Any, **kwargs: Any) -> _ModelOutput: ...
    def save_pretrained(self, save_directory: str | PathLike[str]) -> None: ...
    def to(self, device: Any) -> "PreTrainedModel": ...
    def resize_token_embeddings(self, size: int) -> None: ...


class PreTrainedTokenizerBase:
    pad_token: Optional[str]
    eos_token: Optional[str]
    pad_token_id: Optional[int]

    def __call__(self, *args: Any, **kwargs: Any) -> Dict[str, Any]: ...
    def save_pretrained(self, save_directory: str | PathLike[str]) -> None: ...
    def add_special_tokens(self, special_tokens_dict: Dict[str, Any]) -> None: ...
    def __len__(self) -> int: ...


class _AutoModel:
    @staticmethod
    def from_pretrained(model_name_or_path: str, **kwargs: Any) -> PreTrainedModel: ...


class _AutoTokenizer:
    @staticmethod
    def from_pretrained(model_name_or_path: str, **kwargs: Any) -> PreTrainedTokenizerBase: ...


class _LRScheduler:
    def step(self) -> None: ...


def get_linear_schedule_with_warmup(*args: Any, **kwargs: Any) -> _LRScheduler: ...


AutoModelForSequenceClassification: _AutoModel
AutoTokenizer: _AutoTokenizer

__all__ = [
    "AutoModelForSequenceClassification",
    "AutoTokenizer",
    "PreTrainedModel",
    "PreTrainedTokenizerBase",
    "get_linear_schedule_with_warmup",
]
