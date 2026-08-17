import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { AccountProfile } from '../entities/account';
import { filterAccessibleImageUris } from './imageStorage';

const LOGO_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
};

export type BusinessBranding = { businessName: string; businessAddress: string; logoDataUri: string };

// Resolves the account's export branding, inlining the logo as a base64
// data URI (rather than a file:// src) so it reliably renders inside the
// PDF-generator's WebView regardless of platform sandboxing.
export async function resolveBusinessBranding(profile: AccountProfile): Promise<BusinessBranding> {
  const businessName = profile.businessName?.trim() || '';
  const businessAddress = profile.businessAddress?.trim() || '';
  const logoUri = filterAccessibleImageUris([profile.businessLogoUri])[0];

  if (!logoUri) {
    return { businessName, businessAddress, logoDataUri: '' };
  }

  try {
    const extension = logoUri.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = LOGO_MIME_TYPES[extension] ?? 'image/jpeg';
    const base64 = await FileSystem.readAsStringAsync(logoUri, { encoding: FileSystem.EncodingType.Base64 });

    return { businessName, businessAddress, logoDataUri: `data:${mimeType};base64,${base64}` };
  } catch {
    return { businessName, businessAddress, logoDataUri: '' };
  }
}

export async function createPdfFile(html: string) {
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

export async function sharePdf(uri: string) {
  await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
}

export function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Shared header block (logo, business name/address, eyebrow, filter tags) so
// every PDF export — the row-table exports on the Export tab and the Reports
// summary — reads as one consistent document. Callers supply their own
// `extraStyles`/`bodyHtml` for the layout below the header.
export function buildPdfDocument({
  title,
  branding,
  countLabel,
  filterSummary,
  extraStyles,
  bodyHtml,
}: {
  title: string;
  branding: BusinessBranding;
  countLabel: string;
  filterSummary: string[];
  extraStyles: string;
  bodyHtml: string;
}) {
  const generatedOn = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  const filterTags = filterSummary.length > 0 ? filterSummary : ['No filters applied'];

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #171717;
          padding: 28px;
        }
        .header {
          background: #f5f3f7;
          border-radius: 24px;
          padding: 24px;
          margin-bottom: 20px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .header-copy {
          flex: 1;
          min-width: 0;
        }
        .header-logo {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .eyebrow {
          color: #dd6560;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin: 0 0 8px;
        }
        h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.2;
        }
        .business-name {
          margin-top: 10px;
          color: #171717;
          font-size: 15px;
          font-weight: 700;
        }
        .business-address {
          margin-top: 2px;
          color: #5f5f5f;
          font-size: 12px;
          white-space: pre-line;
        }
        .meta {
          margin-top: 10px;
          color: #5f5f5f;
          font-size: 14px;
        }
        .filters {
          margin-top: 16px;
        }
        .filter-tag {
          display: inline-block;
          background: #f7e3e1;
          color: #74423f;
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 700;
          margin: 0 8px 8px 0;
        }
        ${extraStyles}
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-copy">
          <p class="eyebrow">LivestockBook</p>
          <h1>${escapeHtml(title)}</h1>
          ${branding.businessName ? `<div class="business-name">${escapeHtml(branding.businessName)}</div>` : ''}
          ${branding.businessAddress ? `<div class="business-address">${escapeHtml(branding.businessAddress)}</div>` : ''}
          <div class="meta">${escapeHtml(countLabel)} • Generated ${escapeHtml(generatedOn)}</div>
          <div class="filters">
            ${filterTags.map((tag) => `<span class="filter-tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
        ${branding.logoDataUri ? `<img class="header-logo" src="${branding.logoDataUri}" alt="" />` : ''}
      </div>

      ${bodyHtml}
    </body>
  </html>`;
}
