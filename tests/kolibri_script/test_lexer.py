import json
import sys
from pathlib import Path

import pytest
from hypothesis import assume, given, settings, strategies as st

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from core.kolibri_script.lexer import (
    KEYWORDS,
    TokenizationError,
    hmac_wrap_ksd,
    tokenize_ksd,
)


def _collect(tokens):
    return [(token.type, token.value) for token in tokens]


def test_tokenize_basic_script():
    script = 'let answer = 42\nprint("kolibri")\nif answer >= 10 { return answer }'
    tokens = list(tokenize_ksd(script))
    assert _collect(tokens[:4]) == [
        ("LET", "let"),
        ("IDENTIFIER", "answer"),
        ("ASSIGN", "="),
        ("NUMBER", "42"),
    ]
    assert tokens[4].type == "IDENTIFIER"
    assert tokens[4].value == "print"
    assert any(token.type == "STRING" and token.value == "kolibri" for token in tokens)
    relational = [token for token in tokens if token.type in {"GE", "GT", "LE", "LT"}]
    assert relational and relational[0].type == "GE"


def test_unterminated_string_raises():
    with pytest.raises(TokenizationError):
        list(tokenize_ksd('let text = "oops'))


def test_number_with_trailing_identifier_is_error():
    with pytest.raises(TokenizationError):
        list(tokenize_ksd("let value = 12abc"))


def test_hmac_envelope_contains_metadata():
    tokens = list(tokenize_ksd("let value = 10"))
    payload = {"module": "demo"}
    envelope = hmac_wrap_ksd(tokens, payload, secret=b"secret-key")
    assert envelope.header["alg"] == "HS256"
    assert envelope.header["token_count"] == len(tokens)
    assert envelope.symbols == {"value": 0}
    assert envelope.payload == json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    assert len(envelope.signature) == 64


IDENTIFIER_CHARS = st.characters(min_codepoint=ord("a"), max_codepoint=ord("z"))
STRING_BODY = st.text(alphabet=st.characters(min_codepoint=32, max_codepoint=126).filter(lambda c: c not in {'"', '\\'}), max_size=5)


def _identifier_strategy():
    return (
        st.text(alphabet=IDENTIFIER_CHARS, min_size=1, max_size=5)
        .filter(lambda s: s not in KEYWORDS)
    )


def _string_literal_strategy():
    return STRING_BODY.map(lambda s: '"' + s + '"')


def _number_strategy():
    return st.one_of(
        st.integers(min_value=-1000, max_value=1000).map(str),
        st.floats(allow_nan=False, allow_infinity=False, width=32).map(lambda f: format(f, "g")),
    )


def _symbol_strategy():
    return st.sampled_from(list({"=", "+", "-", "*", "/", "(", ")", "{", "}", ",", ":", "==", "!=", "<=", ">=", "->"}))


def _token_strategy():
    return st.one_of(
        st.sampled_from(list(KEYWORDS.keys())),
        _identifier_strategy(),
        _string_literal_strategy(),
        _number_strategy(),
        _symbol_strategy(),
    )


@settings(max_examples=75)
@given(source=st.lists(_token_strategy(), min_size=1, max_size=8).map(lambda items: " ".join(items)), payload=st.binary(min_size=0, max_size=32), secret=st.binary(min_size=1, max_size=16))
def test_signature_is_stable(source: str, payload: bytes, secret: bytes):
    tokens = list(tokenize_ksd(source))
    first = hmac_wrap_ksd(tokens, payload, secret=secret)
    second = hmac_wrap_ksd(tokens, payload, secret=secret)
    assert first.signature == second.signature


@settings(max_examples=50)
@given(source=st.lists(_token_strategy(), min_size=1, max_size=6).map(lambda items: " ".join(items)), payload=st.binary(min_size=0, max_size=16), secret_one=st.binary(min_size=1, max_size=16), secret_two=st.binary(min_size=1, max_size=16))
def test_signature_changes_when_secret_changes(source: str, payload: bytes, secret_one: bytes, secret_two: bytes):
    assume(secret_one != secret_two)
    tokens = list(tokenize_ksd(source))
    first = hmac_wrap_ksd(tokens, payload, secret=secret_one)
    second = hmac_wrap_ksd(tokens, payload, secret=secret_two)
    assert first.signature != second.signature
