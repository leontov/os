"""Лексический анализатор Kolibri Script.

Модуль предоставляет:
* таблицу ключевых слов;
* конечные автоматы для чисел и строк;
* генератор токенов для файлов с расширением ``.ksd``;
* HMAC-обёртку, обеспечивающую целостность результата разбора.
"""
from __future__ import annotations

from dataclasses import dataclass
import base64
import hashlib
import hmac
import json
from typing import Dict, Iterator, List, Mapping, MutableMapping, Optional, Sequence, Tuple

from core.config import get_secret

KEYWORDS: Mapping[str, str] = {
    "let": "LET",
    "fn": "FUNCTION",
    "return": "RETURN",
    "if": "IF",
    "else": "ELSE",
    "for": "FOR",
    "while": "WHILE",
    "break": "BREAK",
    "continue": "CONTINUE",
    "true": "BOOLEAN",
    "false": "BOOLEAN",
    "null": "NULL",
}

SYMBOLS: Mapping[str, str] = {
    "(": "LPAREN",
    ")": "RPAREN",
    "{": "LBRACE",
    "}": "RBRACE",
    "[": "LBRACKET",
    "]": "RBRACKET",
    ",": "COMMA",
    ":": "COLON",
    ";": "SEMICOLON",
    "+": "PLUS",
    "-": "MINUS",
    "*": "STAR",
    "/": "SLASH",
    "%": "PERCENT",
    "<": "LT",
    ">": "GT",
    "=": "ASSIGN",
}

MULTI_CHAR_SYMBOLS: Mapping[str, str] = {
    "==": "EQ",
    "!=": "NEQ",
    "<=": "LE",
    ">=": "GE",
    "->": "ARROW",
}

ESCAPE_SEQUENCES: Mapping[str, str] = {
    "\\": "\\",
    '"': '"',
    "n": "\n",
    "r": "\r",
    "t": "\t",
}


@dataclass(frozen=True)
class Token:
    """Единица лексического анализа."""

    type: str
    value: str
    position: Tuple[int, int]


class TokenizationError(ValueError):
    """Ошибка лексического анализа."""


class _NumberAutomaton:
    """DFA для числовых литералов."""

    _TRANSITIONS: Mapping[Tuple[str, str], str] = {
        ("start", "sign"): "signed",
        ("start", "digit"): "int",
        ("signed", "digit"): "int",
        ("int", "digit"): "int",
        ("int", "dot"): "dot",
        ("int", "exp"): "exp",
        ("dot", "digit"): "frac",
        ("frac", "digit"): "frac",
        ("frac", "exp"): "exp",
        ("exp", "sign"): "exp_sign",
        ("exp", "digit"): "exp_digit",
        ("exp_sign", "digit"): "exp_digit",
        ("exp_digit", "digit"): "exp_digit",
    }

    def __init__(self) -> None:
        self._accepting = {"int", "frac", "exp_digit"}
        self._start_state = "start"

    def _categorize(self, state: str, char: str) -> str:
        if char.isdigit():
            return "digit"
        if char in "+-":
            return "sign"
        if char in "eE":
            return "exp"
        if char == ".":
            return "dot"
        return "invalid"

    def consume(self, text: str) -> Tuple[str, int]:
        state = self._start_state
        idx = 0
        buffer: List[str] = []
        length = len(text)
        while idx < length:
            char = text[idx]
            category = self._categorize(state, char)
            next_state = self._TRANSITIONS.get((state, category))
            if next_state is None:
                break
            state = next_state
            buffer.append(char)
            idx += 1
        if state not in self._accepting:
            raise TokenizationError(f"Некорректное число: {text[:idx+1]!r}")
        return "".join(buffer), idx


class _StringAutomaton:
    """Специализированный DFA для строковых литералов."""

    def consume(self, text: str) -> Tuple[str, int]:
        if not text or text[0] != '"':
            raise TokenizationError("Строка должна начинаться с кавычки")
        state = "start"
        idx = 0
        buffer: List[str] = []
        length = len(text)
        while idx < length:
            char = text[idx]
            if state == "start":
                state = "body"
                idx += 1
                continue
            if state == "body":
                if char == '"':
                    idx += 1
                    state = "end"
                    break
                if char == "\\":
                    state = "escape"
                    idx += 1
                    continue
                if char in "\n\r":
                    raise TokenizationError("Строковый литерал не может содержать перенос строки")
                buffer.append(char)
                idx += 1
                continue
            if state == "escape":
                replacement = ESCAPE_SEQUENCES.get(char)
                if replacement is None:
                    raise TokenizationError(f"Неизвестная escape-последовательность: \\{char}")
                buffer.append(replacement)
                state = "body"
                idx += 1
                continue
        if state != "end":
            raise TokenizationError("Незавершённый строковый литерал")
        return "".join(buffer), idx


_NUMBER_DFA = _NumberAutomaton()
_STRING_DFA = _StringAutomaton()


def _payload_to_bytes(payload: object) -> bytes:
    if isinstance(payload, bytes):
        return payload
    if isinstance(payload, str):
        return payload.encode("utf-8")
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _normalise_secret(secret: Optional[bytes | str]) -> bytes:
    if secret is None:
        return get_secret()
    if isinstance(secret, bytes):
        return secret
    return secret.encode("utf-8")


@dataclass(frozen=True)
class KolibriScriptEnvelope:
    """Подпись и метаданные Kolibri Script."""

    header: Mapping[str, object]
    symbols: Mapping[str, int]
    payload: bytes
    signature: str


def tokenize_ksd(source: str) -> Iterator[Token]:
    """Генератор токенов для Kolibri Script."""

    idx = 0
    line = 1
    column = 1
    length = len(source)
    while idx < length:
        char = source[idx]
        if char in " \t":
            idx += 1
            column += 1
            continue
        if char == "\n":
            idx += 1
            line += 1
            column = 1
            continue
        start_column = column
        remainder = source[idx:]

        matched_symbol: Optional[str] = None
        for symbol in sorted(MULTI_CHAR_SYMBOLS, key=len, reverse=True):
            if remainder.startswith(symbol):
                matched_symbol = symbol
                break
        if matched_symbol is not None:
            idx += len(matched_symbol)
            column += len(matched_symbol)
            yield Token(MULTI_CHAR_SYMBOLS[matched_symbol], matched_symbol, (line, start_column))
            continue

        if char.isalpha() or char == "_":
            identifier: List[str] = []
            while idx < length and (source[idx].isalnum() or source[idx] == "_"):
                identifier.append(source[idx])
                idx += 1
                column += 1
            value = "".join(identifier)
            token_type = KEYWORDS.get(value, "IDENTIFIER")
            yield Token(token_type, value, (line, start_column))
            continue

        if char.isdigit() or (char in "+-" and idx + 1 < length and source[idx + 1].isdigit()):
            lexeme, consumed = _NUMBER_DFA.consume(remainder)
            following = source[idx + consumed: idx + consumed + 1]
            if following and (following[0].isalpha() or following[0] == "_"):
                raise TokenizationError("Цифровой литерал должен завершаться до идентификатора")
            idx += consumed
            column += consumed
            yield Token("NUMBER", lexeme, (line, start_column))
            continue

        if char == '"':
            value, consumed = _STRING_DFA.consume(remainder)
            idx += consumed
            column += consumed
            yield Token("STRING", value, (line, start_column))
            continue

        if char == "#":
            # Комментарий до конца строки
            while idx < length and source[idx] != "\n":
                idx += 1
            continue

        token_type = SYMBOLS.get(char)
        if token_type:
            idx += 1
            column += 1
            yield Token(token_type, char, (line, start_column))
            continue

        raise TokenizationError(f"Неизвестный символ {char!r} на {line}:{start_column}")


def hmac_wrap_ksd(
    tokens: Sequence[Token],
    payload: object,
    secret: Optional[bytes | str] = None,
) -> KolibriScriptEnvelope:
    """Создаёт HMAC-обёртку для токенов и полезной нагрузки."""

    secret_bytes = _normalise_secret(secret)
    payload_bytes = _payload_to_bytes(payload)

    header: Dict[str, object] = {
        "alg": "HS256",
        "version": 1,
        "token_count": len(tokens),
    }

    symbols: MutableMapping[str, int] = {}
    for token in tokens:
        if token.type == "IDENTIFIER" and token.value not in symbols:
            symbols[token.value] = len(symbols)

    canonical_tokens = [
        {
            "type": token.type,
            "value": token.value,
            "line": token.position[0],
            "column": token.position[1],
        }
        for token in tokens
    ]

    canonical_payload = base64.b64encode(payload_bytes).decode("ascii")

    canonical_document = json.dumps(
        {
            "header": header,
            "symbols": symbols,
            "tokens": canonical_tokens,
            "payload": canonical_payload,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")

    signature = hmac.new(secret_bytes, canonical_document, hashlib.sha256).hexdigest()

    return KolibriScriptEnvelope(header=header, symbols=dict(symbols), payload=payload_bytes, signature=signature)


__all__ = [
    "KEYWORDS",
    "SYMBOLS",
    "Token",
    "TokenizationError",
    "tokenize_ksd",
    "KolibriScriptEnvelope",
    "hmac_wrap_ksd",
]
