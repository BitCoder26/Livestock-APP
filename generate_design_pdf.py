from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer
from PIL import Image as PILImage


OUTPUT_PATH = Path("/Users/admin/Documents/Livestock APP/livestock-app-design-pack.pdf")

IMAGE_PATHS = [
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.24.37.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.59.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.51.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.46.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.41.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.36.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.32.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.26.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.22.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.17.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.13.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.25.04.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.24.58.png"),
    Path("/Users/admin/Desktop/Screenshot 2026-07-10 at 13.24.44.png"),
]


def scaled_size(image_path: Path, max_width: float, max_height: float) -> tuple[float, float]:
    with PILImage.open(image_path) as img:
        width, height = img.size
    scale = min(max_width / width, max_height / height)
    return width * scale, height * scale


def build_pdf() -> None:
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Livestock App Design Pack",
        author="Codex",
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Livestock App Design Pack", styles["Title"]),
        Paragraph(
            "Attached screen references compiled into a single PDF for future handoff.",
            styles["BodyText"],
        ),
        Spacer(1, 8 * mm),
    ]

    max_width = A4[0] - doc.leftMargin - doc.rightMargin
    max_height = A4[1] - doc.topMargin - doc.bottomMargin - 20 * mm

    for index, image_path in enumerate(IMAGE_PATHS, start=1):
        width, height = scaled_size(image_path, max_width, max_height)
        story.append(Paragraph(f"Screen {index}: {image_path.name}", styles["Heading2"]))
        story.append(Spacer(1, 4 * mm))
        story.append(Image(str(image_path), width=width, height=height))
        if index != len(IMAGE_PATHS):
            story.append(PageBreak())

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
