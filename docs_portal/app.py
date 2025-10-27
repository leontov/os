"""FastAPI application exposing the documentation portal."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from .engine import PortalEngine

DEFAULT_CONFIG = Path("docs/portal_config.json")


class VersionPayload(BaseModel):
    name: str
    label: str
    documents: int


class DocumentSummaryPayload(BaseModel):
    identifier: str
    title: str
    summary: str


class DocumentPayload(DocumentSummaryPayload):
    body: str
    examples: list[ExamplePayload]


class ExamplePayload(BaseModel):
    identifier: str
    language: str
    description: Optional[str] = None


class ExampleExecutionPayload(BaseModel):
    stdout: str
    variables: dict[str, str]


def create_app(config_path: Path | None = None) -> FastAPI:
    engine = PortalEngine.from_config(config_path or DEFAULT_CONFIG)

    app = FastAPI(
        title="Kolibri Docs Portal",
        description=(
            "Поисковый портал документации «Колибри ИИ» с версионностью и "
            "интерактивными примерами."
        ),
        version="1.0.0",
    )

    @app.get("/api/versions", response_model=list[VersionPayload])
    def list_versions() -> list[VersionPayload]:
        return [VersionPayload(**entry) for entry in engine.list_versions()]

    @app.get("/api/versions/{version}/docs", response_model=list[DocumentSummaryPayload])
    def list_documents(version: str) -> list[DocumentSummaryPayload]:
        documents = engine.list_documents(version)
        return [
            DocumentSummaryPayload(
                identifier=document.identifier,
                title=document.title,
                summary=document.summary,
            )
            for document in documents
        ]

    @app.get(
        "/api/versions/{version}/docs/{identifier}", response_model=DocumentPayload
    )
    def get_document(version: str, identifier: str) -> DocumentPayload:
        try:
            document = engine.get_document(version, identifier)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return DocumentPayload(
            identifier=document.identifier,
            title=document.title,
            summary=document.summary,
            body=document.body,
            examples=[
                ExamplePayload(
                    identifier=example.identifier,
                    language=example.language,
                    description=example.description,
                )
                for example in document.examples
            ],
        )

    @app.get(
        "/api/versions/{version}/search",
        response_model=list[DocumentSummaryPayload],
    )
    def search(version: str, q: str = Query(alias="query")) -> list[DocumentSummaryPayload]:
        try:
            hits = engine.search(version, q)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return [
            DocumentSummaryPayload(identifier=hit.identifier, title=hit.title, summary=hit.summary)
            for hit in hits
        ]

    @app.post(
        "/api/versions/{version}/examples/{identifier}/execute",
        response_model=ExampleExecutionPayload,
    )
    def execute_example(version: str, identifier: str) -> ExampleExecutionPayload:
        try:
            result = engine.execute_example(version, identifier)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return ExampleExecutionPayload(stdout=result.stdout, variables=dict(result.variables))

    return app


app = create_app()
