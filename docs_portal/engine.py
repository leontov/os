"""Domain engine powering the documentation portal."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Mapping

from .config import PortalConfig, VersionConfig, load_config
from .examples import Example, ExampleExecutor, ExampleParser, ExampleExecution


@dataclass(frozen=True, slots=True)
class Document:
    """Normalized markdown document."""

    identifier: str
    title: str
    summary: str
    body: str
    version: str
    examples: tuple[Example, ...]


@dataclass(frozen=True, slots=True)
class SearchHit:
    """Result entry for a document search."""

    identifier: str
    title: str
    summary: str
    score: int


class SearchIndex:
    """Very small inverted index for on-device search."""

    def __init__(self, documents: Iterable[Document]) -> None:
        self._documents = {doc.identifier: doc for doc in documents}
        self._content_cache = {
            doc.identifier: f"{doc.title}\n{doc.body}".lower() for doc in documents
        }

    def search(self, query: str) -> List[SearchHit]:
        tokens = [token for token in query.lower().split() if token]
        results: List[SearchHit] = []
        if not tokens:
            return results
        for identifier, content in self._content_cache.items():
            score = sum(content.count(token) for token in tokens)
            if score:
                doc = self._documents[identifier]
                results.append(
                    SearchHit(
                        identifier=identifier,
                        title=doc.title,
                        summary=doc.summary,
                        score=score,
                    )
                )
        results.sort(key=lambda hit: hit.score, reverse=True)
        return results


class PortalEngine:
    """Loads documentation content and provides portal operations."""

    def __init__(self, config: PortalConfig, documents: Mapping[str, List[Document]]) -> None:
        self._config = config
        self._documents = {version: {doc.identifier: doc for doc in docs} for version, docs in documents.items()}
        self._search_indexes = {
            version: SearchIndex(version_docs.values()) for version, version_docs in self._documents.items()
        }
        self._examples: Dict[str, Dict[str, Example]] = {}
        for version, docs in documents.items():
            example_map: Dict[str, Example] = {}
            for doc in docs:
                for example in doc.examples:
                    example_map[example.identifier] = example
            self._examples[version] = example_map
        self._executor = ExampleExecutor()

    @classmethod
    def from_config(cls, config_path: Path) -> "PortalEngine":
        config = load_config(config_path)
        documents = {
            version.name: list(_load_version_documents(version))
            for version in config.ordered_versions()
        }
        return cls(config=config, documents=documents)

    @property
    def default_version(self) -> str:
        return self._config.default_version

    def list_versions(self) -> List[dict[str, object]]:
        payload = []
        for version in self._config.ordered_versions():
            payload.append(
                {
                    "name": version.name,
                    "label": version.label,
                    "documents": len(self._documents.get(version.name, {})),
                }
            )
        return payload

    def list_documents(self, version: str) -> List[Document]:
        return list(self._documents.get(version, {}).values())

    def get_document(self, version: str, identifier: str) -> Document:
        try:
            return self._documents[version][identifier]
        except KeyError as exc:
            raise KeyError(f"Unknown document '{identifier}' for version '{version}'") from exc

    def search(self, version: str, query: str) -> List[SearchHit]:
        try:
            index = self._search_indexes[version]
        except KeyError as exc:
            raise KeyError(f"Unknown documentation version: {version}") from exc
        return index.search(query)

    def list_examples(self, version: str) -> List[Example]:
        return list(self._examples.get(version, {}).values())

    def execute_example(self, version: str, identifier: str) -> ExampleExecution:
        try:
            example = self._examples[version][identifier]
        except KeyError as exc:
            raise KeyError(f"Unknown example '{identifier}' in version '{version}'") from exc
        return self._executor.execute(example)


def _load_version_documents(version: VersionConfig) -> Iterable[Document]:
    parser = ExampleParser()
    for path in sorted(version.path.rglob("*.md")):
        markdown = path.read_text(encoding="utf-8")
        title = _extract_title(markdown) or path.stem.replace("_", " ").title()
        summary = _extract_summary(markdown, title)
        base_identifier = path.relative_to(version.path).with_suffix("")
        doc_identifier = str(base_identifier).replace("/", "::")
        examples = tuple(parser.parse(markdown, base_identifier=doc_identifier))
        yield Document(
            identifier=doc_identifier,
            title=title,
            summary=summary,
            body=markdown,
            version=version.name,
            examples=examples,
        )


def _extract_title(markdown: str) -> str | None:
    for line in markdown.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return None


def _extract_summary(markdown: str, title: str) -> str:
    lines = markdown.splitlines()
    summary_lines: List[str] = []
    capture = False
    for line in lines:
        if not capture and line.startswith("# "):
            capture = True
            continue
        if capture:
            stripped = line.strip()
            if not stripped:
                if summary_lines:
                    break
                continue
            summary_lines.append(stripped)
    if not summary_lines:
        return title
    return " ".join(summary_lines[:2])
