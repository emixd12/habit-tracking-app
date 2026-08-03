"""Dynamic discovery and replay helpers for rendered Next.js Server Actions."""

from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urljoin


class FormDiscoveryError(RuntimeError):
    """Raised without including submitted identifiers or field values."""


@dataclass(frozen=True)
class ServerActionForm:
    action: str
    method: str
    fields: tuple[tuple[str, str], ...]


@dataclass
class _ParsedForm:
    action: str
    method: str
    fields: list[tuple[str, str]]


class _FormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.forms: list[_ParsedForm] = []
        self._current: _ParsedForm | None = None

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)

        if tag == "form":
            self._current = _ParsedForm(
                action=attributes.get("action") or "",
                method=(attributes.get("method") or "get").upper(),
                fields=[],
            )
            return

        if tag != "input" or self._current is None:
            return

        name = attributes.get("name")
        input_type = (attributes.get("type") or "text").lower()
        if not name or input_type in {"button", "image", "reset", "submit"}:
            return

        self._current.fields.append((name, attributes.get("value") or ""))

    def handle_endtag(self, tag: str) -> None:
        if tag == "form" and self._current is not None:
            self.forms.append(self._current)
            self._current = None


def discover_occurrence_status_form(
    html: str,
    *,
    document_url: str,
    occurrence_id: str,
    expected_status: str,
    status: str,
) -> ServerActionForm:
    parser = _FormParser()
    parser.feed(html)

    for form in parser.forms:
        fields = dict(form.fields)
        if (
            fields.get("occurrence_id") == occurrence_id
            and fields.get("expected_status") == expected_status
            and fields.get("status") == status
        ):
            if form.method != "POST":
                raise FormDiscoveryError(
                    "The discovered occurrence action is not a POST form."
                )
            if not any(name.startswith("$ACTION_") for name, _ in form.fields):
                raise FormDiscoveryError(
                    "The rendered form did not expose generated Server Action fields."
                )

            return ServerActionForm(
                action=urljoin(document_url, form.action or document_url),
                method=form.method,
                fields=tuple(form.fields),
            )

    raise FormDiscoveryError(
        "No matching rendered occurrence status Server Action form was found."
    )


def replace_form_field(
    form: ServerActionForm,
    *,
    name: str,
    value: str,
) -> ServerActionForm:
    replaced = False
    fields: list[tuple[str, str]] = []

    for field_name, field_value in form.fields:
        if field_name == name:
            fields.append((field_name, value))
            replaced = True
        else:
            fields.append((field_name, field_value))

    if not replaced:
        raise FormDiscoveryError("The requested rendered form field was absent.")

    return ServerActionForm(
        action=form.action,
        method=form.method,
        fields=tuple(fields),
    )
