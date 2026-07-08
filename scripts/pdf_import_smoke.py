from pathlib import Path
from tempfile import TemporaryDirectory
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from stt_server import (  # noqa: E402
    PDFBrokenTextLayerError,
    PDFOcrRequiredError,
    extract_pdf_text,
    looks_like_broken_pdf_text,
    validate_pdf_extracted_text,
)


def pdf_string_literal(text):
    return "(" + text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ")"


def write_minimal_pdf(path, text=None):
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    ]

    if text is None:
        objects.append("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>")
    else:
        stream = f"BT /F1 18 Tf 72 720 Td {pdf_string_literal(text)} Tj ET"
        objects.extend(
            [
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
                "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
                f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream",
            ]
        )

    data = bytearray(b"%PDF-1.4\n")
    offsets = [0]

    for index, obj in enumerate(objects, start=1):
        offsets.append(len(data))
        data.extend(f"{index} 0 obj\n{obj}\nendobj\n".encode("latin-1"))

    xref_offset = len(data)
    data.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("latin-1"))

    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))

    data.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode(
            "latin-1"
        )
    )
    path.write_bytes(bytes(data))


def assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def assert_in(needle, haystack, label):
    if needle not in haystack:
        raise AssertionError(f"{label}: expected {needle!r} in {haystack!r}")


def assert_raises(expected_error, func, label):
    try:
        func()
    except expected_error as exc:
        return str(exc)
    except Exception as exc:
        raise AssertionError(f"{label}: expected {expected_error.__name__}, got {type(exc).__name__}: {exc}") from exc

    raise AssertionError(f"{label}: expected {expected_error.__name__}")


def main():
    with TemporaryDirectory(prefix="smartreader-pdf-smoke-") as temp_dir:
        temp_path = Path(temp_dir)

        clean_pdf = temp_path / "clean-text.pdf"
        write_minimal_pdf(clean_pdf, "Clean PDF text 123")
        assert_equal(extract_pdf_text(str(clean_pdf)), "Clean PDF text 123", "clean PDF extraction")

        image_only_pdf = temp_path / "image-only.pdf"
        write_minimal_pdf(image_only_pdf)
        empty_message = assert_raises(
            PDFOcrRequiredError,
            lambda: extract_pdf_text(str(image_only_pdf)),
            "image-only PDF branch",
        )
        assert_in("OCR", empty_message, "image-only PDF message")

    mixed_text = "Русский English 123"
    if looks_like_broken_pdf_text(mixed_text):
        raise AssertionError("mixed Cyrillic/Latin text should not be classified as broken")

    broken_text = "■■■■■■■■■■"
    if not looks_like_broken_pdf_text(broken_text):
        raise AssertionError("black-square glyph text should be classified as broken")

    broken_message = assert_raises(
        PDFBrokenTextLayerError,
        lambda: validate_pdf_extracted_text(broken_text),
        "broken glyph branch",
    )
    assert_in("поврежденный текстовый слой", broken_message, "broken glyph message")

    print("pdf import smoke ok")


if __name__ == "__main__":
    main()
