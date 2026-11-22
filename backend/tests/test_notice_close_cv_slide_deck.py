"""Close proof for the CV upload that 500'd on 2026-10-30.

The file was a CV built as a one-slide PowerPoint deck and named .docx (the
upload picker takes PDF and DOCX only). python-docx refuses a presentation
package with ValueError; that escaped `POST /cv/upload/finalize` twice, and the
finalize filed the same two attempts as an object with no job. The bytes decide
what the file is, not its name: the upload now reads the slides.
"""

import io
import zipfile

from app.services import cv_parser

NOTICE_CAUSE_KEY = "unhandled_500:ValueError:app/services/cv_parser.py:_extract_text_docx"
NOTICE_CAUSE_KEY = "upload_guarantee:object_no_job"

_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
_CT = "http://schemas.openxmlformats.org/package/2006/content-types"
_SLIDE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
_OFFICE_DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
_DECK_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
_SHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"


def _package(main_part: str, main_type: str, parts: dict[str, str]) -> bytes:
    """An Office package the way Office writes one: content types + root rels."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(
            "[Content_Types].xml",
            f'<Types xmlns="{_CT}">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            f'<Override PartName="/{main_part}" ContentType="{main_type}"/></Types>',
        )
        z.writestr(
            "_rels/.rels",
            f'<Relationships xmlns="{_PKG}">'
            f'<Relationship Id="rId1" Type="{_OFFICE_DOC_REL}" Target="{main_part}"/></Relationships>',
        )
        for name, xml in parts.items():
            z.writestr(name, xml)
    return buf.getvalue()


def _slide(*paragraphs: tuple[str, ...]) -> str:
    """A slide whose text box holds one <a:p> per paragraph, one <a:r> per run."""
    body = "".join(
        "<a:p>" + "".join(f"<a:r><a:t>{run}</a:t></a:r>" for run in runs) + "</a:p>"
        for runs in paragraphs
    )
    return (
        f'<p:sld xmlns:a="{_A}" xmlns:p="{_P}"><p:cSld><p:spTree>'
        f"<p:sp><p:txBody>{body}</p:txBody></p:sp>"
        "</p:spTree></p:cSld></p:sld>"
    )


def _deck(slides_in_show_order: list[tuple[str, str]]) -> bytes:
    """A PowerPoint package. Each entry is (part name, slide xml), in show order."""
    ids = "".join(
        f'<p:sldId id="{256 + i}" r:id="rId{i + 1}"/>' for i in range(len(slides_in_show_order))
    )
    rels = "".join(
        f'<Relationship Id="rId{i + 1}" Type="{_SLIDE_REL}" Target="slides/{name}"/>'
        for i, (name, _) in enumerate(slides_in_show_order)
    )
    return _package("ppt/presentation.xml", _DECK_TYPE, {
        "ppt/presentation.xml":
            f'<p:presentation xmlns:p="{_P}" xmlns:r="{_R}"><p:sldIdLst>{ids}</p:sldIdLst></p:presentation>',
        "ppt/_rels/presentation.xml.rels": f'<Relationships xmlns="{_PKG}">{rels}</Relationships>',
        **{f"ppt/slides/{name}": xml for name, xml in slides_in_show_order},
    })


def test_a_slide_deck_named_docx_reads_as_its_slides() -> None:
    deck = _deck([
        ("slide1.xml", _slide(
            ("Asha ", "Rao"),
            ("Data Analyst",),
            ("Built the weekly sales dashboard in ", "Power BI &amp; SQL."),
        )),
    ])

    text = cv_parser.extract_raw_text(deck, "docx")

    assert text.splitlines() == [
        "Asha Rao",
        "Data Analyst",
        "Built the weekly sales dashboard in Power BI & SQL.",
    ]


def test_slides_read_in_show_order_not_file_order() -> None:
    deck = _deck([
        ("slide2.xml", _slide(("Experience",))),
        ("slide1.xml", _slide(("Education",))),
    ])

    assert cv_parser.extract_raw_text(deck, "docx").splitlines() == ["Experience", "Education"]


def test_a_package_that_is_neither_word_nor_slides_is_empty_text() -> None:
    sheet = _package("xl/workbook.xml", _SHEET_TYPE, {"xl/workbook.xml": "<workbook/>"})

    assert cv_parser.extract_raw_text(sheet, "docx") == ""
