#!/usr/bin/env python3
"""
Marugen Koi Farm — programmatic invoice PDF (reportlab).

pip install reportlab pillow
python scripts/generate_invoice_pdf.py --output invoice.pdf
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "src" / "assets" / "logo.png"
MAROON = colors.HexColor("#601416")

COMPANY = {
    "address": "21 Neo Tiew Lane 1, Singapore 718788",
    "phone": "+65 9745 9730",
    "email": "koi@marugenfishfarm.com",
    "website": "marugenfishfarm.com",
}


def fmt_money(v: float) -> str:
    return f"{float(v):,.2f}"


def fmt_date(date_str: str) -> str:
    if not date_str:
        return ""
    try:
        d = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return f"{d.day} {d.strftime('%B %Y')}"
    except ValueError:
        return date_str


def draw_brush_line(c: canvas.Canvas, x1: float, x2: float, y: float):
    c.setStrokeColor(MAROON)
    c.setLineWidth(2.5)
    c.line(x1, y, x2, y)
    c.setLineWidth(1)
    c.line(x1, y - 1.5, x2, y - 1.2)


def build_pdf(data: dict, output: Path):
    w, h = A4
    m = 18 * mm
    c = canvas.Canvas(str(output), pagesize=A4)

    c.setStrokeColor(colors.black)
    c.setLineWidth(1.5)
    c.rect(m - 4, m - 4, w - 2 * m + 8, h - 2 * m + 8)

    y = h - m - 10

    if LOGO.exists():
        c.drawImage(str(LOGO), m, y - 55, width=55, height=55, preserveAspectRatio=True, mask="auto")

    c.setFont("Helvetica", 9)
    lines = [COMPANY["address"], COMPANY["phone"], COMPANY["email"], COMPANY["website"]]
    ty = y - 5
    for line in lines:
        c.drawRightString(w - m, ty, line)
        ty -= 12

    c.setFont("Times-Bold", 32)
    c.drawCentredString(w / 2, y - 75, "INVOICE")

    meta_y = y - 115
    c.setFont("Helvetica-Bold", 10)
    c.drawString(m, meta_y, "Bill To")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(m, meta_y - 16, data.get("customerName", ""))

    c.setFont("Helvetica", 10)
    c.drawRightString(w - m, meta_y, f"Invoice #: {data.get('id', '')}")
    c.drawRightString(w - m, meta_y - 14, f"Invoice Date: {fmt_date(data.get('date', ''))}")

    table_y = meta_y - 45
    draw_brush_line(c, m, w - m, table_y + 18)

    items = data.get("items") or []
    rows = [["Item Description", "Quantity", "Unit Price", "Total"]]
    for it in items:
        qty = float(it.get("qty", 0))
        price = float(it.get("price", 0))
        rows.append([
            it.get("name", ""),
            str(int(qty) if qty == int(qty) else qty),
            fmt_money(price),
            fmt_money(qty * price),
        ])
    while len(rows) < 8:
        rows.append(["", "", "", ""])

    col_w = [w - 2 * m - 120, 45, 55, 55]
    table = Table(rows, colWidths=col_w)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.grey),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    tw, th = table.wrap(w - 2 * m, 200)
    table.drawOn(c, m, table_y - th)

    subtotal = sum(float(i.get("qty", 0)) * float(i.get("price", 0)) for i in items)
    shipping = float(data.get("shipping") or 0)
    tax = float(data.get("tax") or 0)
    discount_type = data.get("discountType") or "none"
    discount_value = float(data.get("discountValue") or 0)
    discount_amount = 0.0
    if discount_type == "percent" and discount_value > 0:
        discount_amount = round(subtotal * min(discount_value, 100) / 100, 2)
    elif discount_type == "fixed" and discount_value > 0:
        discount_amount = round(min(subtotal, discount_value), 2)
    total = float(data.get("total") or max(0, subtotal - discount_amount + shipping + tax))

    totals_x = w - m - 55
    ty = table_y - th - 30
    c.setFont("Helvetica", 10)
    total_rows = [("Subtotal", subtotal)]
    if discount_amount > 0:
        label = f"Discount ({discount_value:g}%)" if discount_type == "percent" else "Discount"
        total_rows.append((label, -discount_amount))
    total_rows.extend([("Shipping", shipping), ("Sales Tax", tax)])
    for label, val in total_rows:
        c.drawRightString(totals_x - 50, ty, label)
        c.drawRightString(w - m, ty, fmt_money(val))
        ty -= 16

    draw_brush_line(c, totals_x - 80, w - m, ty + 8)
    ty -= 10
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(totals_x - 50, ty, "TOTAL AMOUNT DUE")
    c.drawRightString(w - m, ty, f"S${fmt_money(total)}")
    c.setFillColor(colors.black)

    c.setFont("Helvetica", 9)
    c.drawString(m, m + 30, f"Contact Us – {COMPANY['phone']} | {COMPANY['email']}")
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(m, m + 16, "Thank you for your business.")

    c.showPage()
    c.save()


def sample_data() -> dict:
    return {
        "id": "INV-SAMPLE01",
        "date": "2026-06-05",
        "customerName": "Sarah Lim",
        "items": [{"name": "Pond Salt 2kg", "qty": 1, "price": 12}],
        "total": 12,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-o", "--output", default="marugen-invoice.pdf")
    parser.add_argument("-d", "--data")
    args = parser.parse_args()
    payload = json.loads(Path(args.data).read_text()) if args.data else sample_data()
    build_pdf(payload, Path(args.output))
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
