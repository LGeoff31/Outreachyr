from __future__ import annotations

import unittest

from resume_profile_parser import (
    extract_pdf_text,
    normalize_school_name,
    parse_resume_text,
)


def _minimal_pdf_with_text(text: str) -> bytes:
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ]
    stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("utf-8")
    objects.append(
        b"5 0 obj\n<< /Length "
        + str(len(stream)).encode("ascii")
        + b" >>\nstream\n"
        + stream
        + b"\nendstream\nendobj\n"
    )
    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = [0]
    for obj in objects:
        offsets.append(len(out))
        out.extend(obj)
    xref_at = len(out)
    out.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    out.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    out.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n".encode("ascii")
    )
    return bytes(out)


class ResumeProfileParserTests(unittest.TestCase):
    def test_extract_pdf_text_reads_text_from_pdf_bytes(self) -> None:
        data = _minimal_pdf_with_text("University of Waterloo Resume")

        text = extract_pdf_text(data)

        self.assertIn("University of Waterloo Resume", text)

    def test_parse_resume_text_extracts_structured_sections(self) -> None:
        raw_text = """
        Geoffrey Lee
        https://github.com/geoff

        EDUCATION
        University of Waterloo
        Bachelor of Computer Science, Data Science
        Expected May 2027

        EXPERIENCE
        Software Engineer Intern, Snowflake
        Built ingestion pipelines in Python and SQL.

        PROJECTS
        Distributed Job Queue - Python, Redis, Docker
        Built a fault-tolerant worker system.

        SKILLS
        Python, TypeScript, React, PostgreSQL
        """

        profile = parse_resume_text(raw_text)

        self.assertEqual(profile.primary_school_name, "University of Waterloo")
        self.assertEqual(
            profile.primary_school_normalized,
            normalize_school_name("University of Waterloo"),
        )
        self.assertEqual(profile.primary_major, "Data Science")
        self.assertEqual(profile.grad_year, 2027)
        self.assertIn("Python", profile.skills)
        self.assertEqual(profile.education[0]["school"], "University of Waterloo")
        self.assertEqual(profile.experience[0]["title"], "Software Engineer Intern")
        self.assertEqual(profile.projects[0]["name"], "Distributed Job Queue")
        self.assertEqual(profile.links, ["https://github.com/geoff"])

    def test_parse_resume_text_prefers_current_school_for_transfer_resume(self) -> None:
        raw_text = """
        EDUCATION
        University of Toronto
        Computer Science, 2022 - 2023

        University of Waterloo
        Bachelor of Computer Science
        2024 - 2027 Expected
        """

        profile = parse_resume_text(raw_text)

        self.assertEqual(profile.primary_school_name, "University of Waterloo")
        self.assertEqual(len(profile.education), 2)


if __name__ == "__main__":
    unittest.main()
