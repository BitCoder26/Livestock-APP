from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer


OUTPUT_PATH = "/Users/admin/Documents/Livestock APP/livestock-app-handoff.pdf"


def bullet_list(items, style):
    return ListFlowable(
        [ListItem(Paragraph(item, style)) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=14,
    )


def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Livestock App Handoff",
        author="Codex",
    )

    styles = getSampleStyleSheet()
    title = styles["Title"]
    heading = styles["Heading2"]
    body = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=14,
        spaceAfter=6,
    )
    small = ParagraphStyle(
        "Small",
        parent=body,
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#555555"),
    )

    story = [
        Paragraph("Livestock App Handoff", title),
        Paragraph(
            "Purpose: attach this PDF to the next chat so the next assistant can continue with the correct product context, constraints, and delivery plan without starting over.",
            body,
        ),
        Paragraph(
            "Prepared on 10 July 2026 from the current Codex session.",
            small,
        ),
        Spacer(1, 8),
        Paragraph("Current Situation", heading),
        bullet_list(
            [
                "The working Codex workspace is <b>/Users/admin/Documents/Livestock APP</b> and it is currently an empty Git repository with no app source files yet.",
                "A separate folder exists at <b>/Users/admin/Documents/projects/livestock-app</b> containing design assets in an <b>Icons</b> directory.",
                "The design references were provided as screenshots showing the intended mobile UI for a livestock management app.",
                "No verified production codebase, package manifest, framework setup, backend, or test suite was found in the accessible workspace during this session.",
                "Assumption for the next chat: treat this as a fresh mobile app build unless the user provides or grants access to an existing codebase.",
            ],
            body,
        ),
        Spacer(1, 6),
        Paragraph("Product Goal", heading),
        bullet_list(
            [
                "Build a mobile livestock management app from the provided designs and icon assets.",
                "Ship it as quickly as possible without taking shortcuts that would create fragile architecture or obvious bugs.",
                "Prioritize correctness in records, animal management, exports, setup data, media attachments, and navigation.",
            ],
            body,
        ),
        Spacer(1, 6),
        Paragraph("Screens Observed In The Designs", heading),
        bullet_list(
            [
                "Records list",
                "Records filter modal",
                "Add record form",
                "Animal selection modal",
                "Animals list",
                "Animal timeline/detail history",
                "Add animal form",
                "Species selection modal",
                "Setup dashboard",
                "Farms list",
                "Add farm form",
                "Export for records",
                "Export for animals",
                "Settings screen",
            ],
            body,
        ),
        Spacer(1, 6),
        Paragraph("Core Domain Objects To Model", heading),
        bullet_list(
            [
                "Animal: tag/ID, species, breed, sex, date of birth, weight, status, farm, field/paddock, group, notes, photo.",
                "Record: type, date, one or many animals, medicine or treatment fields where relevant, dose, movement/sale/purchase/birth/death data, notes, photos.",
                "Farm: name, type, holding ID, area, description, paddocks/fields, photos, current/previous state where applicable.",
                "Reference data: species, groups, medicines, paddocks/fields, farm types, export filters, preferences.",
                "Export artifacts: PDF and spreadsheet outputs for both records and animals.",
            ],
            body,
        ),
        Spacer(1, 6),
        Paragraph("High-Risk Areas", heading),
        bullet_list(
            [
                "Validation and business rules around required fields, date logic, unique animal tags, and status transitions.",
                "Export accuracy for PDF and spreadsheet generation.",
                "Photo attachment handling, permissions, and file storage.",
                "Offline/local data consistency if the app is local-first.",
                "Conditional record forms because each record type has different required inputs.",
            ],
            body,
        ),
        Spacer(1, 6),
        Paragraph("Recommended Build Sequence", heading),
        bullet_list(
            [
                "Freeze the v1 scope to the screens shown in the designs.",
                "Choose delivery target and stack: iOS, Android, or both, plus the mobile framework and data layer.",
                "Set up the repo, CI, linting, formatting, typing, testing, environments, and secrets handling.",
                "Normalize and catalog the icon assets from the external Icons folder.",
                "Create a design system and shared components before page-by-page implementation.",
                "Define the complete data model, validation rules, and navigation architecture.",
                "Implement Setup reference data flows first if other screens depend on farms, fields, groups, or medicines.",
                "Build Animals flows next: list, detail/timeline, add/edit animal, species selection, media upload.",
                "Build Records flows next: list, filtering, add record, record-type logic, animal selection, attachments.",
                "Build Export flows after core data is stable, including record and animal export filters plus file generation.",
                "Build Settings and support screens last among core features.",
                "Add analytics, crash reporting, and robust seeded demo data for QA.",
                "Run layered testing: unit, component, integration, end-to-end, and manual device QA.",
                "Prepare store assets, privacy/support info, release builds, and submission notes.",
                "Launch with monitoring and a hotfix path ready.",
            ],
            body,
        ),
        Spacer(1, 6),
        Paragraph("Important Constraints For The Next Assistant", heading),
        bullet_list(
            [
                "Do not assume there is an existing codebase in the current workspace unless the user points to one or grants access to it.",
                "Base implementation decisions on the screenshot designs and the external Icons asset folder.",
                "Do not skip architecture, validation, or testing work in the name of speed.",
                "Treat export generation, attachments, and domain rules as first-class product requirements rather than polish.",
                "If access is needed to <b>/Users/admin/Documents/projects/livestock-app</b>, request it explicitly before trying to import or reorganize those assets.",
            ],
            body,
        ),
        Spacer(1, 6),
        Paragraph("Best Immediate Next Step", heading),
        Paragraph(
            "In the next chat, ask the assistant to either 1) scaffold the app in <b>/Users/admin/Documents/Livestock APP</b> from scratch using the designs, or 2) inspect an existing codebase if the user can provide its exact location and grant access. The assistant should begin by confirming platform target, framework choice, and whether the app is local-first or backend-connected.",
            body,
        ),
    ]

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
