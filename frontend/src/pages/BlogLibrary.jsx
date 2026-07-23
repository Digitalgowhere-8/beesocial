import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { APP_EVENT_CONTENT_CHANGED } from '../utils/appEvents';
import useInfiniteScroll from '../hooks/useInfiniteScroll';
import { ArrowLeft, BookOpenText, CalendarDays, Check, CheckSquare, Copy, FileText, Loader2, MessageSquareText, MoreHorizontal, RefreshCw, Search, Sparkles, Square, Tag, Trash2, X } from 'lucide-react';

const LIBRARY_MODES = [
  { key: 'blogs', label: 'Blog', desktopLabel: 'Blog', icon: BookOpenText },
  { key: 'linkedin', label: 'Social Media', desktopLabel: 'Social Media Post', icon: MessageSquareText },
];
const LIBRARY_CACHE_VERSION = 'v1';
const LIBRARY_PAGE_SIZE = 12;

function safeSessionGet(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSessionSet(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore cache write failures.
  }
}

function normalizeSelectionText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function findSmallestElementContainingText(root, text = '') {
  const needle = normalizeSelectionText(text);
  if (!root || !needle) return null;

  const candidates = Array.from(root.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,td,th,div'));
  return candidates
    .filter((element) => normalizeSelectionText(element.innerText || element.textContent || '').includes(needle))
    .sort((a, b) => (a.innerText || a.textContent || '').length - (b.innerText || b.textContent || '').length)[0] || null;
}

function renderInlineMarkdown(text = '') {
  const parts = [];
  const pattern = /(\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={`${match.index}-${match[2]}`}>{match[2]}</strong>);
    } else {
      parts.push(
        <a
          key={`${match.index}-${match[3]}`}
          href={match[4]}
          target="_blank"
          rel="noreferrer"
          className="font-bold text-brand-crimson underline decoration-brand-crimson/25 underline-offset-4 transition-colors hover:text-brand-hoverred"
        >
          {match[3]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : text;
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdownHtml(text = '') {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function sopHeadingMeta(heading = '') {
  const key = String(heading || '').trim().toLowerCase();
  if (key === 'banner') return { label: 'CREATIVE BRIEF', color: '#0369a1', border: '#bae6fd', bg: '#f0f9ff' };
  if (key === 'cta' || key === 'recommended next step') return { label: 'CONVERSION', color: '#047857', border: '#a7f3d0', bg: '#ecfdf5' };
  if (key === 'keywords/tags' || key === 'keywords' || key === 'tags') return { label: 'SEO', color: '#b45309', border: '#fde68a', bg: '#fffbeb' };
  if (key.includes('meta') || key === 'social media copy') return { label: 'DISTRIBUTION', color: '#7c3aed', border: '#ddd6fe', bg: '#f5f3ff' };
  if (key === 'resources') return { label: 'ATTRIBUTION', color: '#7c3aed', border: '#ddd6fe', bg: '#f5f3ff' };
  return null;
}

function stripInlineMarkdown(text = '') {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)');
}

function normalizePreviewMarkdown(bodyMarkdown = '', title = '') {
  const lines = String(bodyMarkdown || '').replace(/\r\n/g, '\n').split('\n');
  const output = [];
  let skippedFirstH1 = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      output.push('');
      continue;
    }

    if (!skippedFirstH1 && /^#\s+/.test(trimmed)) {
      const headingText = trimmed.replace(/^#\s+/, '').trim().toLowerCase();
      if (!title || headingText === String(title).trim().toLowerCase()) {
        skippedFirstH1 = true;
        continue;
      }
    }

    output.push(line);
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isMarkdownTableRow(line = '') {
  const trimmed = String(line || '').trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length > 2;
}

function isMarkdownTableDivider(line = '') {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseMarkdownTableRow(line = '') {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function sopSectionTone(heading = '') {
  const key = String(heading || '').trim().toLowerCase();
  if (key === 'banner') {
    return {
      eyebrow: 'Creative Brief',
      className: 'content-repo-sop-banner content-repo-sop-banner-creative',
      labelClassName: 'content-repo-sop-eyebrow'
    };
  }
  if (key === 'cta' || key === 'recommended next step') {
    return {
      eyebrow: 'Conversion',
      className: 'content-repo-sop-banner content-repo-sop-banner-conversion',
      labelClassName: 'content-repo-sop-eyebrow'
    };
  }
  if (key === 'keywords/tags' || key === 'keywords' || key === 'tags') {
    return {
      eyebrow: 'SEO',
      className: 'content-repo-sop-banner content-repo-sop-banner-seo',
      labelClassName: 'content-repo-sop-eyebrow'
    };
  }
  if (key.includes('meta') || key === 'social media copy' || key === 'resources') {
    return {
      eyebrow: key === 'resources' ? 'Attribution' : 'Distribution',
      className: 'content-repo-sop-banner content-repo-sop-banner-distribution',
      labelClassName: 'content-repo-sop-eyebrow'
    };
  }
  return null;
}

function markdownToPlainText(bodyMarkdown = '', title = '') {
  const lines = normalizePreviewMarkdown(bodyMarkdown, title).split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      if (output[output.length - 1]) output.push('');
      i += 1;
      continue;
    }

    if (/^#{2,3}\s+/.test(line)) {
      output.push(stripInlineMarkdown(line.replace(/^#{2,3}\s+/, '')));
      output.push('');
      i += 1;
      continue;
    }

    if (isMarkdownTableRow(line) && isMarkdownTableDivider(lines[i + 1] || '')) {
      output.push(parseMarkdownTableRow(line).map(stripInlineMarkdown).join('\t'));
      i += 2;
      while (i < lines.length && isMarkdownTableRow(lines[i]) && !isMarkdownTableDivider(lines[i])) {
        output.push(parseMarkdownTableRow(lines[i]).map(stripInlineMarkdown).join('\t'));
        i += 1;
      }
      output.push('');
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      output.push(`- ${stripInlineMarkdown(line.replace(/^\s*-\s+/, '').trim())}`);
      i += 1;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      output.push(stripInlineMarkdown(line));
      i += 1;
      continue;
    }

    output.push(stripInlineMarkdown(line));
    i += 1;
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function markdownToHtml(bodyMarkdown = '', title = '') {
  const lines = normalizePreviewMarkdown(bodyMarkdown, title).split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      blocks.push(`<h3>${renderInlineMarkdownHtml(line.replace(/^###\s+/, ''))}</h3>`);
      i += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      const heading = line.replace(/^##\s+/, '');
      const sopMeta = sopHeadingMeta(heading);
      if (sopMeta) {
        blocks.push(
          `<div style="border:1px solid ${sopMeta.border};background:${sopMeta.bg};padding:12px 16px;margin:28px 0 12px;border-radius:10px;">` +
          `<div style="font-size:10px;letter-spacing:1.8px;font-weight:700;color:${sopMeta.color};">${sopMeta.label}</div>` +
          `<h2 style="margin:4px 0 0;color:#111827;font-size:20px;">${renderInlineMarkdownHtml(heading === 'Recommended next step' ? 'CTA' : heading)}</h2>` +
          `</div>`
        );
      } else {
        blocks.push(`<h2>${renderInlineMarkdownHtml(heading)}</h2>`);
      }
      i += 1;
      continue;
    }

    if (isMarkdownTableRow(line) && isMarkdownTableDivider(lines[i + 1] || '')) {
      const headers = parseMarkdownTableRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && isMarkdownTableRow(lines[i]) && !isMarkdownTableDivider(lines[i])) {
        rows.push(parseMarkdownTableRow(lines[i]));
        i += 1;
      }
      blocks.push([
        '<table>',
        '<thead><tr>',
        headers.map((header) => `<th>${renderInlineMarkdownHtml(header)}</th>`).join(''),
        '</tr></thead>',
        '<tbody>',
        rows.map((row) => `<tr>${headers.map((_, index) => `<td>${renderInlineMarkdownHtml(row[index] || '')}</td>`).join('')}</tr>`).join(''),
        '</tbody></table>'
      ].join(''));
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, '').trim());
        i += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdownHtml(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemLines = [lines[i].replace(/^\s*\d+\.\s+/, '').trim()];
        i += 1;
        while (i < lines.length) {
          const next = lines[i].trim();
          if (!next || /^##\s+/.test(next) || /^###\s+/.test(next) || /^\s*\d+\.\s+/.test(next) || /^\s*-\s+/.test(next) || isMarkdownTableRow(next)) break;
          itemLines.push(next);
          i += 1;
        }
        items.push(itemLines.join(' '));
        if (!lines[i]?.trim()) i += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdownHtml(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraphLines = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || /^##\s+/.test(next) || /^###\s+/.test(next) || /^\s*-\s+/.test(next) || /^\s*\d+\.\s+/.test(next) || isMarkdownTableRow(next)) break;
      paragraphLines.push(next);
      i += 1;
    }
    blocks.push(`<p>${renderInlineMarkdownHtml(paragraphLines.join(' '))}</p>`);
  }

  return blocks.join('');
}

function parseSopSections(bodyMarkdown = '', title = '') {
  const lines = normalizePreviewMarkdown(bodyMarkdown, title).split('\n');
  const sections = [];
  let current = { heading: '', lines: [] };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const match = line.trim().match(/^##\s+(.+)$/);
    if (match) {
      if (current.heading || current.lines.some((item) => item.trim())) sections.push(current);
      current = { heading: match[1].trim(), lines: [] };
      continue;
    }
    current.lines.push(line);
  }

  if (current.heading || current.lines.some((item) => item.trim())) sections.push(current);
  return sections;
}

function sectionKey(heading = '') {
  return String(heading || '').trim().toLowerCase();
}

function sectionText(lines = []) {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isMetaSection(heading = '') {
  const key = sectionKey(heading);
  return [
    'banner',
    'keywords/tags',
    'keywords',
    'tags',
    'seo / meta title',
    'seo/meta title',
    'seo meta title',
    'meta title',
    'meta description',
    'social media copy',
    'resources',
    'cta',
    'recommended next step'
  ].includes(key);
}

function isFaqSection(heading = '') {
  const key = sectionKey(heading);
  return key === 'faq' || key === 'faqs';
}

function findSopSection(sections = [], names = []) {
  const keys = names.map(sectionKey);
  return sections.find((section) => keys.includes(sectionKey(section.heading)));
}

function headingHtml(label = '') {
  return `<p style="margin:18px 0 8px;font-weight:700;color:#111827;">${escapeHtml(label)}</p>`;
}

function wordRowHtml(label = '', content = '', options = {}) {
  const verticalAlign = options.verticalAlign || 'top';
  return [
    '<tr style="page-break-inside:auto;break-inside:auto;">',
    `<td style="border:1px solid #111;padding:8px 10px;width:18%;vertical-align:${verticalAlign};font-weight:700;color:#111;font-size:8pt;line-height:1.25;page-break-inside:auto;break-inside:auto;">${escapeHtml(label)}</td>`,
    `<td style="border:1px solid #111;padding:8px 10px;vertical-align:${verticalAlign};color:#111;font-size:9pt;line-height:1.32;page-break-inside:auto;break-inside:auto;">${content}</td>`,
    '</tr>'
  ].join('');
}

function splitMarkdownForWordRows(markdown = '') {
  const lines = normalizePreviewMarkdown(markdown, '').split('\n');
  const chunks = [];
  let current = [];
  let i = 0;

  const pushCurrent = () => {
    const text = current.join('\n').trim();
    if (text) chunks.push(text);
    current = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      pushCurrent();
      i += 1;
      continue;
    }

    if (/^##+\s+/.test(trimmed)) {
      pushCurrent();
      chunks.push(trimmed);
      i += 1;
      continue;
    }

    if (isMarkdownTableRow(trimmed) && isMarkdownTableDivider(lines[i + 1] || '')) {
      pushCurrent();
      const tableLines = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && isMarkdownTableRow(lines[i]) && !isMarkdownTableDivider(lines[i])) {
        tableLines.push(lines[i]);
        i += 1;
      }
      chunks.push(tableLines.join('\n'));
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      pushCurrent();
      const listLines = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]) || !lines[i].trim())) {
        if (lines[i].trim()) listLines.push(lines[i]);
        i += 1;
      }
      chunks.push(listLines.join('\n'));
      continue;
    }

    current.push(line);
    i += 1;
  }

  pushCurrent();
  return chunks;
}

function sectionMarkdownRows(sections = [], firstLabel = 'Content', prefixHtml = '') {
  let usedLabel = false;
  const rows = [];
  if (prefixHtml) {
    rows.push(wordRowHtml(firstLabel, prefixHtml));
    usedLabel = true;
  }
  sections.forEach((section) => {
    const text = section.heading ? `## ${section.heading}\n${sectionText(section.lines)}` : sectionText(section.lines);
    splitMarkdownForWordRows(text).forEach((chunk) => {
      rows.push(wordRowHtml(usedLabel ? '' : firstLabel, markdownToHtml(chunk)));
      usedLabel = true;
    });
  });
  return rows;
}

function faqMarkdownRows(faqSection) {
  if (!faqSection) return [];
  const lines = sectionText(faqSection.lines).split('\n');
  const chunks = [];
  let current = [];
  for (const line of lines) {
    if (/^###\s+/.test(line.trim()) && current.length) {
      chunks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.join('\n').trim()) chunks.push(current.join('\n'));
  return chunks.flatMap((chunk, index) => (
    splitMarkdownForWordRows(chunk).map((part, partIndex) => (
      wordRowHtml(index === 0 && partIndex === 0 ? 'FAQs' : '', markdownToHtml(part))
    ))
  ));
}

function buildWordCopyPayload({ title = '', excerpt = '', bodyMarkdown = '' }) {
  const sections = parseSopSections(bodyMarkdown, title);
  const keywordsSection = findSopSection(sections, ['Keywords/Tags', 'Keywords', 'Tags']);
  const metaTitleSection = findSopSection(sections, ['SEO / Meta Title', 'SEO Meta Title', 'Meta Title']);
  const metaDescriptionSection = findSopSection(sections, ['Meta Description']);
  const socialSection = findSopSection(sections, ['Social Media Copy']);
  const resourcesSection = findSopSection(sections, ['Resources']);
  const ctaSection = findSopSection(sections, ['CTA', 'Recommended next step']);
  const faqSection = findSopSection(sections, ['FAQ', 'FAQs']);
  const contentSections = sections.filter((section) => !isMetaSection(section.heading) && !isFaqSection(section.heading));
  const contentMarkdown = contentSections
    .map((section) => section.heading ? `## ${section.heading}\n${sectionText(section.lines)}` : sectionText(section.lines))
    .filter(Boolean)
    .join('\n\n');

  const keywordsText = keywordsSection ? markdownToPlainText(sectionText(keywordsSection.lines)) : '';
  const metaTitleText = metaTitleSection ? markdownToPlainText(sectionText(metaTitleSection.lines)) : '';
  const metaDescriptionText = metaDescriptionSection ? markdownToPlainText(sectionText(metaDescriptionSection.lines)) : '';
  const socialText = socialSection ? markdownToPlainText(sectionText(socialSection.lines)) : '';
  const resourcesText = resourcesSection ? markdownToPlainText(sectionText(resourcesSection.lines)) : '';
  const ctaLines = ctaSection ? sectionText(ctaSection.lines).split('\n').map((line) => line.trim()).filter(Boolean) : [];
  const ctaTitle = ctaLines[0] || '';
  const ctaButton = ctaLines.find((line) => /advisor|contact|book|speak|learn|download/i.test(line)) || '';
  const ctaDescription = ctaLines.filter((line) => line !== ctaTitle && line !== ctaButton).join('\n');

  const plainParts = [
    keywordsText ? `Keywords\n${keywordsText}` : '',
    `Title\n${stripInlineMarkdown(title)}`,
    `Content\n${[stripInlineMarkdown(excerpt), markdownToPlainText(contentMarkdown, title)].filter(Boolean).join('\n\n')}`,
    ctaTitle || ctaDescription || ctaButton
      ? ['CTA Title : ' + ctaTitle, ctaDescription, ctaButton ? `Button: ${ctaButton}` : ''].filter(Boolean).join('\n')
      : '',
    metaTitleText ? `Meta Title\n${metaTitleText}` : '',
    metaDescriptionText ? `Meta Description\n${metaDescriptionText}` : '',
    socialText ? `Social Copy\n${socialText}` : '',
    resourcesText ? `Resource\n${resourcesText}` : ''
  ].filter(Boolean);

  const faqText = faqSection ? markdownToPlainText(sectionText(faqSection.lines)) : '';
  const contentRows = sectionMarkdownRows(
    contentSections,
    'Content',
    excerpt ? `<p>${renderInlineMarkdownHtml(excerpt)}</p>` : ''
  );
  const faqRows = faqMarkdownRows(faqSection);
  const htmlRows = [
    keywordsText ? wordRowHtml('Keywords', markdownToHtml(sectionText(keywordsSection.lines))) : '',
    wordRowHtml('Title', `<div style="font-size:16pt;line-height:1.2;font-weight:700;color:#000;">${escapeHtml(title)}</div>`, { verticalAlign: 'middle' }),
    ...contentRows,
    ...faqRows,
    ctaTitle || ctaDescription || ctaButton
      ? wordRowHtml('CTA', `${ctaTitle ? `<p><strong>CTA Title :</strong> ${escapeHtml(ctaTitle)}</p>` : ''}${ctaDescription ? `<p>${renderInlineMarkdownHtml(ctaDescription)}</p>` : ''}${ctaButton ? `<p><strong>Button:</strong> ${escapeHtml(ctaButton)}</p>` : ''}`)
      : '',
    metaTitleText ? wordRowHtml('Meta Title', `<p>${renderInlineMarkdownHtml(metaTitleText)}</p>`) : '',
    metaDescriptionText ? wordRowHtml('Meta Description', `<p>${renderInlineMarkdownHtml(metaDescriptionText)}</p>`) : '',
    socialText ? wordRowHtml('Social Copy', `<p>${renderInlineMarkdownHtml(socialText).replace(/\n/g, '<br />')}</p>`) : '',
    resourcesText ? wordRowHtml('Resource', `<p>${renderInlineMarkdownHtml(resourcesText).replace(/\n/g, '<br />')}</p>`) : ''
  ].filter(Boolean);

  return {
    plainText: plainParts.join('\n\n').trim(),
    htmlBody: `<table style="border-collapse:collapse;width:100%;border:1px solid #111;page-break-inside:auto;break-inside:auto;mso-table-lspace:0pt;mso-table-rspace:0pt;">${htmlRows.join('')}</table>`
  };
}

function MarkdownArticle({ bodyMarkdown = '', title = '' }) {
  const lines = normalizePreviewMarkdown(bodyMarkdown, title).split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      blocks.push(
        <h4 key={`h3-${i}`} className="mt-6 text-lg font-black text-gray-900">
          {line.replace(/^###\s+/, '')}
        </h4>
      );
      i += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      const heading = line.replace(/^##\s+/, '');
      if (/^table of contents$/i.test(heading)) {
        const items = [];
        i += 1;
        while (i < lines.length && !lines[i].trim()) i += 1;
        while (i < lines.length && (/^\s*-\s+/.test(lines[i]) || !lines[i].trim())) {
          if (!lines[i].trim()) {
            i += 1;
            continue;
          }
          items.push(lines[i].replace(/^\s*-\s+/, '').trim());
          i += 1;
        }
        blocks.push(
          <section key={`toc-${i}`} className="my-8 rounded-2xl border border-gray-200 bg-gray-50/70 p-5">
            <h3 className="text-base font-black uppercase tracking-[0.14em] text-gray-500">Table of Contents</h3>
            <ul className="mt-5 grid gap-3 text-[15px] font-semibold leading-7 text-gray-800">
              {items.map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-3 rounded-xl border border-gray-200/80 bg-white/80 px-4 py-3 shadow-sm">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-crimson/80" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        );
        continue;
      }

      const sopTone = sopSectionTone(heading);
      if (sopTone) {
        const sectionLines = [];
        i += 1;
        while (i < lines.length && !/^##\s+/.test(lines[i].trim())) {
          sectionLines.push(lines[i]);
          i += 1;
        }
        blocks.push(
          <div key={`sop-${i}`} className={`mt-10 rounded-2xl border px-5 py-4 ${sopTone.className}`}>
            <div className={`text-[10px] font-black uppercase tracking-[0.18em] ${sopTone.labelClassName}`}>{sopTone.eyebrow}</div>
            <h3 className="mt-1 text-xl font-black tracking-tight">
              {heading === 'Recommended next step' ? 'CTA' : heading}
            </h3>
            {sectionLines.join('\n').trim() ? (
              <div className="content-repo-sop-body mt-4">
                <MarkdownArticle bodyMarkdown={sectionLines.join('\n')} title="" />
              </div>
            ) : null}
          </div>
        );
        continue;
      }

      blocks.push(
        <h3 key={`h2-${i}`} className="mt-10 text-2xl font-black tracking-tight text-gray-900">
          {heading}
        </h3>
      );
      i += 1;
      continue;
    }

    if (isMarkdownTableRow(line) && isMarkdownTableDivider(lines[i + 1] || '')) {
      const headers = parseMarkdownTableRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && isMarkdownTableRow(lines[i]) && !isMarkdownTableDivider(lines[i])) {
        rows.push(parseMarkdownTableRow(lines[i]));
        i += 1;
      }

      blocks.push(
        <div key={`table-${i}`} className="my-7 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm ring-1 ring-gray-100">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50/90">
              <tr>
                {headers.map((header, index) => (
                  <th key={`${header}-${index}`} className="px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-gray-600">
                    {renderInlineMarkdown(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="align-top">
                  {headers.map((header, cellIndex) => (
                    <td key={`${header}-${rowIndex}-${cellIndex}`} className="px-4 py-3 text-[15px] font-medium leading-7 text-gray-700">
                      {renderInlineMarkdown(row[cellIndex] || '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, '').trim());
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-5 list-disc space-y-2 pl-6 text-[15px] leading-8 text-gray-700 marker:text-brand-crimson">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const firstLine = lines[i].replace(/^\s*\d+\.\s+/, '').trim();
        const itemLines = [firstLine];
        i += 1;
        while (i < lines.length) {
          const next = lines[i].trim();
          if (!next || /^##\s+/.test(next) || /^###\s+/.test(next) || /^\s*[-\d]+\.\s+/.test(next) || /^\s*-\s+/.test(next) || isMarkdownTableRow(next)) break;
          itemLines.push(next);
          i += 1;
        }
        items.push(itemLines.join(' '));
        if (!lines[i]?.trim()) i += 1;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-5 list-decimal space-y-3 pl-6 text-[15px] leading-8 text-gray-700 marker:font-black marker:text-brand-crimson">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || /^##\s+/.test(next) || /^###\s+/.test(next) || /^\s*-\s+/.test(next) || /^\s*\d+\.\s+/.test(next) || isMarkdownTableRow(next)) break;
      paragraphLines.push(next);
      i += 1;
    }

    blocks.push(
      <p key={`p-${i}`} className="mt-5 text-[15px] leading-8 text-gray-700">
        {renderInlineMarkdown(paragraphLines.join(' '))}
      </p>
    );
  }

  return <div>{blocks}</div>;
}

export default function BlogLibrary() {
  const { isAdmin, user } = useAuth();
  const location = useLocation();
  const inboundState = location.state || {};
  const cacheKey = useMemo(
    () => `blog_library_cache:${LIBRARY_CACHE_VERSION}:${user?._id || 'guest'}`,
    [user?._id]
  );
  const cachedLibraryState = useMemo(
    () => safeSessionGet(cacheKey, null),
    [cacheKey]
  );
  const [mode, setMode] = useState(() => inboundState.mode || cachedLibraryState?.mode || 'blogs');
  const [items, setItems] = useState(cachedLibraryState?.items || []);
  const [socialItems, setSocialItems] = useState(cachedLibraryState?.socialItems || []);
  const [selected, setSelected] = useState(cachedLibraryState?.selected || null);
  const [selectedSocial, setSelectedSocial] = useState(cachedLibraryState?.selectedSocial || null);
  const [blogPage, setBlogPage] = useState(cachedLibraryState?.blogPage || 1);
  const [blogHasMore, setBlogHasMore] = useState(cachedLibraryState?.blogHasMore ?? true);
  const [socialPage, setSocialPage] = useState(cachedLibraryState?.socialPage || 1);
  const [socialHasMore, setSocialHasMore] = useState(cachedLibraryState?.socialHasMore ?? true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedSocialIds, setSelectedSocialIds] = useState([]);
  const [query, setQuery] = useState('');
  const [loadingBlogs, setLoadingBlogs] = useState(() => !cachedLibraryState?.items?.length);
  const [loadingSocial, setLoadingSocial] = useState(() => !cachedLibraryState?.socialItems?.length);
  const [mobileModeMenuOpen, setMobileModeMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [blogFeedback, setBlogFeedback] = useState('');
  const [socialFeedback, setSocialFeedback] = useState('');
  const [blogComment, setBlogComment] = useState('');
  const [selectedCommentTarget, setSelectedCommentTarget] = useState(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState('');
  const [updatingCommentId, setUpdatingCommentId] = useState('');
  const [revisingBlog, setRevisingBlog] = useState(false);
  const [revisingSocial, setRevisingSocial] = useState(false);
  const [savingRevision, setSavingRevision] = useState(false);
  const [unsavedConfirm, setUnsavedConfirm] = useState(null);
  const [mobileReaderOpen, setMobileReaderOpen] = useState(false);
  const blogPreviewRef = useRef(null);
  const loading = mode === 'blogs' ? loadingBlogs : loadingSocial;
  const savedSelectedBlog = useMemo(
    () => items.find((blog) => blog._id === selected?._id) || null,
    [items, selected?._id]
  );
  const savedSelectedSocial = useMemo(
    () => socialItems.find((post) => post._id === selectedSocial?._id) || null,
    [selectedSocial?._id, socialItems]
  );
  const blogDraftDirty = Boolean(selected?._id && savedSelectedBlog && (
    selected.title !== savedSelectedBlog.title ||
    selected.excerpt !== savedSelectedBlog.excerpt ||
    selected.bodyMarkdown !== savedSelectedBlog.bodyMarkdown
  ));
  const socialDraftDirty = Boolean(selectedSocial?._id && savedSelectedSocial && (
    selectedSocial.selectedTopic !== savedSelectedSocial.selectedTopic ||
    selectedSocial.postText !== savedSelectedSocial.postText ||
    JSON.stringify(selectedSocial.hashtags || []) !== JSON.stringify(savedSelectedSocial.hashtags || [])
  ));
  const hasUnsavedRevision = blogDraftDirty || socialDraftDirty;

  useEffect(() => {
    setSelectedCommentTarget(null);
  }, [selected?._id]);

  const captureBlogSelection = useCallback(() => {
    const root = blogPreviewRef.current;
    const selection = window.getSelection?.();
    if (!root || !selection || selection.rangeCount === 0) return;
    const selectedText = selection.toString().replace(/\s+/g, ' ').trim();
    if (!selectedText) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;

    const bodyText = root.innerText || '';
    const index = bodyText.indexOf(selectedText);
    setSelectedCommentTarget({
      selectedText: selectedText.slice(0, 1000),
      beforeText: index >= 0 ? bodyText.slice(Math.max(0, index - 240), index).trim().slice(-500) : '',
      afterText: index >= 0 ? bodyText.slice(index + selectedText.length, index + selectedText.length + 240).trim().slice(0, 500) : ''
    });
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection?.();
      const selectedText = selection?.toString?.().trim() || '';
      if (!selectedText) return;

      const root = blogPreviewRef.current;
      if (!root || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setSelectedCommentTarget(null);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const confirmUnsavedLeave = useCallback((action, message = 'You have unsaved changes. Discard them and continue, or keep editing.') => {
    if (!hasUnsavedRevision) {
      action();
      return;
    }
    setUnsavedConfirm({
      message,
      onDiscard: () => {
        setUnsavedConfirm(null);
        if (blogDraftDirty && savedSelectedBlog) setSelected(savedSelectedBlog);
        if (socialDraftDirty && savedSelectedSocial) setSelectedSocial(savedSelectedSocial);
        setBlogFeedback('');
        setSocialFeedback('');
        action();
      }
    });
  }, [blogDraftDirty, hasUnsavedRevision, savedSelectedBlog, savedSelectedSocial, socialDraftDirty]);

  const loadBlogs = useCallback(async ({ page = 1, reset = false } = {}) => {
    setLoadingBlogs(true);
    setError('');
    try {
      const params = { status: 'review,published', limit: LIBRARY_PAGE_SIZE, page };
      if (query) params.q = query;
      const { data } = await api.get('/blogs', { params });
      const nextBlogs = data.items || [];
      setItems((prev) => (
        reset ? nextBlogs : [...prev, ...nextBlogs.filter((item) => !prev.some((existing) => existing._id === item._id))]
      ));
      setSelected((prev) => {
        const targetId = inboundState.selectedBlogId;
        if (targetId) return nextBlogs.find((item) => item._id === targetId) || prev || nextBlogs[0] || null;
        if (prev?._id) {
          return nextBlogs.find((item) => item._id === prev._id) || prev;
        }
        return nextBlogs[0] || null;
      });
      setBlogPage(page);
      setBlogHasMore(page < Number(data.pages || page));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not load content');
    } finally {
      setLoadingBlogs(false);
    }
  }, [inboundState.selectedBlogId, query]);

  const loadSocial = useCallback(async ({ page = 1, reset = false } = {}) => {
    setLoadingSocial(true);
    setError('');
    try {
      const params = { platform: 'linkedin', limit: LIBRARY_PAGE_SIZE, page };
      if (query) params.q = query;
      const { data } = await api.get('/blogs/social-posts', { params });
      const nextSocial = data.items || [];
      setSocialItems((prev) => (
        reset ? nextSocial : [...prev, ...nextSocial.filter((item) => !prev.some((existing) => existing._id === item._id))]
      ));
      setSelectedSocial((prev) => {
        const targetId = inboundState.selectedSocialId;
        if (targetId) return nextSocial.find((item) => item._id === targetId) || prev || nextSocial[0] || null;
        if (prev?._id) {
          return nextSocial.find((item) => item._id === prev._id) || prev;
        }
        return nextSocial[0] || null;
      });
      setSocialPage(page);
      setSocialHasMore(page < Number(data.pages || page));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not load content');
    } finally {
      setLoadingSocial(false);
    }
  }, [inboundState.selectedSocialId, query]);

  useEffect(() => {
    if (mode === 'blogs') {
      loadBlogs({ page: 1, reset: true });
      return;
    }
    loadSocial({ page: 1, reset: true });
  }, [loadBlogs, loadSocial, mode]);

  useEffect(() => {
    if (inboundState.selectedBlogId || inboundState.selectedSocialId) {
      setMobileReaderOpen(true);
    }
  }, [inboundState.selectedBlogId, inboundState.selectedSocialId]);

  useEffect(() => {
    setBlogComment('');
  }, [selected?._id]);

  useEffect(() => {
    safeSessionSet(cacheKey, {
      mode,
      items,
      socialItems,
      selected,
      selectedSocial,
      blogPage,
      blogHasMore,
      socialPage,
      socialHasMore
    });
  }, [blogHasMore, blogPage, cacheKey, items, mode, selected, selectedSocial, socialHasMore, socialPage, socialItems]);

  useEffect(() => {
    const handleContentChanged = (event) => {
      const scope = event.detail?.scope || '';
      if (hasUnsavedRevision) return;
      if (!scope || scope === 'blogs') {
        loadBlogs({ page: 1, reset: true });
      }
      if (!scope || scope === 'social') {
        loadSocial({ page: 1, reset: true });
      }
    };

    window.addEventListener(APP_EVENT_CONTENT_CHANGED, handleContentChanged);
    return () => window.removeEventListener(APP_EVENT_CONTENT_CHANGED, handleContentChanged);
  }, [hasUnsavedRevision, loadBlogs, loadSocial]);

  const blogLoadMoreRef = useInfiniteScroll({
    enabled: mode === 'blogs',
    hasMore: blogHasMore,
    loading: loadingBlogs,
    onLoadMore: () => loadBlogs({ page: blogPage + 1 })
  });

  const socialLoadMoreRef = useInfiniteScroll({
    enabled: mode === 'linkedin',
    hasMore: socialHasMore,
    loading: loadingSocial,
    onLoadMore: () => loadSocial({ page: socialPage + 1 })
  });

  const toggleSelection = (id) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    ));
  };

  const toggleSelectAllBlogs = () => {
    setSelectedIds((prev) => (
      prev.length === items.length ? [] : items.map((item) => item._id)
    ));
  };

  const toggleSocialSelection = (id) => {
    setSelectedSocialIds((prev) => (
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    ));
  };

  const toggleSelectAllSocial = () => {
    setSelectedSocialIds((prev) => (
      prev.length === socialItems.length ? [] : socialItems.map((item) => item._id)
    ));
  };

  const deletePosts = async (ids) => {
    const targetIds = ids.filter(Boolean);
    if (!targetIds.length) return;
    const confirmed = window.confirm(targetIds.length === 1 ? 'Delete this post?' : `Delete ${targetIds.length} posts?`);
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      if (targetIds.length === 1) {
        await api.delete(`/blogs/${targetIds[0]}`);
      } else {
        await api.delete('/blogs/bulk', { data: { ids: targetIds } });
      }
      setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      if (targetIds.includes(selected?._id)) setSelected(null);
      await loadBlogs({ page: 1, reset: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const deleteSocialPosts = async (ids) => {
    const targetIds = ids.filter(Boolean);
    if (!targetIds.length) return;
    const confirmed = window.confirm(targetIds.length === 1 ? 'Delete this social post?' : `Delete ${targetIds.length} social posts?`);
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      if (targetIds.length === 1) {
        await api.delete(`/blogs/social-posts/${targetIds[0]}`);
      } else {
        await api.delete('/blogs/social-posts/bulk', { data: { ids: targetIds } });
      }
      setSelectedSocialIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      if (targetIds.includes(selectedSocial?._id)) setSelectedSocial(null);
      await loadSocial({ page: 1, reset: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const updateBlogItem = useCallback((item) => {
    if (!item?._id) return;
    setSelected(item);
    setItems((prev) => prev.map((blog) => blog._id === item._id ? item : blog));
  }, []);

  const copyBlogPost = useCallback(async () => {
    if (!selected) return;
    const wordPayload = buildWordCopyPayload({
      title: selected.title || '',
      excerpt: selected.excerpt || '',
      bodyMarkdown: selected.bodyMarkdown || ''
    });
    const plainText = wordPayload.plainText;
    const html = `
      <article>
        <style>
          article { color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.32; margin: 0 auto; max-width: 820px; }
          h1 { color: #000; font-size: 16pt; line-height: 1.2; margin: 0; }
          h2 { color: #111; font-size: 11pt; line-height: 1.2; margin: 8px 0 5px; font-weight: 700; page-break-after: avoid; }
          h3 { color: #111; font-size: 9.5pt; line-height: 1.2; margin: 7px 0 4px; font-weight: 700; page-break-after: avoid; }
          p { margin: 4px 0 6px; text-align: justify; }
          blockquote { border-left: 3px solid #163A24; color: #4b5563; font-style: italic; margin: 0 0 10px; padding: 3px 0 3px 10px; }
          ul, ol { margin: 5px 0 7px 18px; padding: 0; text-align: left; }
          li { margin: 2px 0; text-align: left; }
          table { border-collapse: collapse; margin: 7px 0; width: 100%; page-break-inside:auto; break-inside:auto; }
          tr { page-break-inside:auto; break-inside:auto; }
          th, td { border: 1px solid #111; padding: 5px 7px; text-align: left; vertical-align: top; page-break-inside:auto; break-inside:auto; }
          th { background: #f3f4f6; color: #111; font-weight: 700; }
          a { color: #163A24; }
        </style>
        ${wordPayload.htmlBody}
      </article>
    `;

    try {
      if (navigator.clipboard.write && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' })
          })
        ]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setError(err.message || 'Could not copy content');
    }
  }, [selected]);

  const copySocialPost = useCallback(async () => {
    if (!selectedSocial?.postText) return;
    const hashtags = Array.isArray(selectedSocial.hashtags) && selectedSocial.hashtags.length
      ? `\n\n${selectedSocial.hashtags.join(' ')}`
      : '';
    try {
      await navigator.clipboard.writeText(`${selectedSocial.postText}${hashtags}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setError(err.message || 'Could not copy content');
    }
  }, [selectedSocial]);

  const improveSelectedBlog = useCallback(async () => {
    const feedback = blogFeedback.trim();
    if (!selected?._id || !feedback || revisingBlog) return;
    setRevisingBlog(true);
    setError('');
    try {
      const { data } = await api.post(`/blogs/${selected._id}/revise`, { feedback, previewOnly: true });
      const item = data.item;
      if (item) {
        setSelected(item);
        setBlogFeedback('');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not improve blog post');
    } finally {
      setRevisingBlog(false);
    }
  }, [blogFeedback, revisingBlog, selected?._id]);

  const improveSelectedSocial = useCallback(async () => {
    const feedback = socialFeedback.trim();
    if (!selectedSocial?._id || !feedback || revisingSocial) return;
    setRevisingSocial(true);
    setError('');
    try {
      const { data } = await api.post(`/blogs/social-posts/${selectedSocial._id}/revise`, { feedback, previewOnly: true });
      const item = data.item;
      if (item) {
        setSelectedSocial(item);
        setSocialFeedback('');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not improve social post');
    } finally {
      setRevisingSocial(false);
    }
  }, [revisingSocial, selectedSocial?._id, socialFeedback]);

  const saveBlogRevision = useCallback(async () => {
    if (!selected?._id || savingRevision) return;
    setSavingRevision(true);
    setError('');
    try {
      const { data } = await api.patch(`/blogs/${selected._id}`, {
        title: selected.title || '',
        excerpt: selected.excerpt || '',
        bodyMarkdown: selected.bodyMarkdown || ''
      });
      const item = data.item;
      if (item) {
        updateBlogItem(item);
        window.dispatchEvent(new CustomEvent(APP_EVENT_CONTENT_CHANGED, { detail: { scope: 'blogs' } }));
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not save blog edits');
    } finally {
      setSavingRevision(false);
    }
  }, [savingRevision, selected, updateBlogItem]);

  const submitBlogComment = useCallback(async () => {
    const text = blogComment.trim();
    if (!selected?._id || !text || submittingComment) return;
    setSubmittingComment(true);
    setError('');
    try {
      const { data } = await api.post(`/blogs/${selected._id}/comments`, {
        text,
        selectedText: selectedCommentTarget?.selectedText || '',
        beforeText: selectedCommentTarget?.beforeText || '',
        afterText: selectedCommentTarget?.afterText || ''
      });
      if (data.item) {
        updateBlogItem(data.item);
        setBlogComment('');
        setSelectedCommentTarget(null);
        window.getSelection?.()?.removeAllRanges?.();
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not save comment');
    } finally {
      setSubmittingComment(false);
    }
  }, [blogComment, selected?._id, selectedCommentTarget, submittingComment, updateBlogItem]);

  const scrollToBlogCommentSelection = useCallback((comment = {}) => {
    const root = blogPreviewRef.current;
    const target = findSmallestElementContainingText(root, comment.selectedText);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('content-repo-comment-jump-highlight');
    window.setTimeout(() => {
      target.classList.remove('content-repo-comment-jump-highlight');
    }, 1800);
  }, []);

  const updateBlogComment = useCallback(async (commentId, patch) => {
    if (!selected?._id || !commentId || updatingCommentId) return;
    setUpdatingCommentId(commentId);
    setError('');
    try {
      const { data } = await api.patch(`/blogs/${selected._id}/comments/${commentId}`, patch);
      if (data.item) updateBlogItem(data.item);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not update comment');
    } finally {
      setUpdatingCommentId('');
    }
  }, [selected?._id, updateBlogItem, updatingCommentId]);

  const deleteBlogComment = useCallback(async (commentId) => {
    if (!selected?._id || !commentId || deletingCommentId) return;
    const confirmed = window.confirm('Delete this comment?');
    if (!confirmed) return;

    setDeletingCommentId(commentId);
    setError('');
    try {
      const { data } = await api.delete(`/blogs/${selected._id}/comments/${commentId}`);
      if (data.item) updateBlogItem(data.item);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not delete comment');
    } finally {
      setDeletingCommentId('');
    }
  }, [deletingCommentId, selected?._id, updateBlogItem]);

  const saveSocialRevision = useCallback(async () => {
    if (!selectedSocial?._id || savingRevision) return;
    setSavingRevision(true);
    setError('');
    try {
      const { data } = await api.patch(`/blogs/social-posts/${selectedSocial._id}`, {
        selectedTopic: selectedSocial.selectedTopic || '',
        postText: selectedSocial.postText || '',
        hashtags: selectedSocial.hashtags || []
      });
      const item = data.item;
      if (item) {
        setSelectedSocial(item);
        setSocialItems((prev) => prev.map((post) => post._id === item._id ? item : post));
        window.dispatchEvent(new CustomEvent(APP_EVENT_CONTENT_CHANGED, { detail: { scope: 'social' } }));
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not save social post edits');
    } finally {
      setSavingRevision(false);
    }
  }, [savingRevision, selectedSocial]);

  const openReaderOnSmallScreens = () => {
    if (window.matchMedia('(max-width: 1279px)').matches) setMobileReaderOpen(true);
  };

  const activeMode = LIBRARY_MODES.find((item) => item.key === mode) || LIBRARY_MODES[0];
  const ActiveModeIcon = activeMode.icon;
  const contentRevisionLocked = revisingBlog || revisingSocial || savingRevision;

  const headerActions = (
    <>
    <div className="flex w-full items-center justify-between gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:hidden">
        <div className="inline-flex min-h-[42px] items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-[13px] font-black text-gray-900 shadow-sm">
          <ActiveModeIcon size={14} />
          {activeMode.label}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => confirmUnsavedLeave(() => mode === 'blogs' ? loadBlogs({ page: 1, reset: true }) : loadSocial({ page: 1, reset: true }))}
          className="app-refresh-button inline-flex h-[42px] min-w-[42px] items-center justify-center rounded-2xl border px-3 shadow-sm transition-all"
          aria-label="Refresh content repository"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={() => setMobileModeMenuOpen((value) => !value)}
          className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-all hover:border-brand-crimson/20 hover:text-brand-crimson"
          aria-label="Open repository menu"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div className="hidden w-full min-w-0 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="relative min-w-0 max-w-xl flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            className="h-11 w-full rounded-2xl border border-gray-200 bg-white py-0 pl-10 pr-4 text-sm font-medium leading-normal text-gray-700 shadow-sm transition-all placeholder:text-gray-400 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-crimson/20 focus:border-brand-crimson/40"
            value={query}
            disabled={hasUnsavedRevision}
            onChange={(e) => {
              setQuery(e.target.value);
              setMobileReaderOpen(false);
            }}
            placeholder={mode === 'linkedin' ? 'Search LinkedIn posts...' : 'Search articles...'}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="content-header-segmented grid grid-cols-2 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
            {LIBRARY_MODES.map((item) => {
              const Icon = item.icon;
              const active = mode === item.key;
              return (
                <button type="button" key={item.key} onClick={() => confirmUnsavedLeave(() => { setMode(item.key); setQuery(''); setMobileReaderOpen(false); })} className={`content-header-tab ${active ? 'content-header-tab-active' : 'content-header-tab-idle'} flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-black transition-all sm:px-5 sm:text-[13px] ${active ? 'bg-brand-crimson text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <Icon size={14} />
                  <span className="sm:hidden">{item.label}</span>
                  <span className="hidden sm:inline">{item.desktopLabel}</span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => confirmUnsavedLeave(() => mode === 'blogs' ? loadBlogs({ page: 1, reset: true }) : loadSocial({ page: 1, reset: true }))} className="app-refresh-button inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border px-5 text-[13px] font-black shadow-sm transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>
    </div>
    {mobileModeMenuOpen ? (
      <>
        <button
          type="button"
          aria-label="Close repository menu"
          onClick={() => setMobileModeMenuOpen(false)}
          className="fixed inset-0 z-40 bg-gray-950/20 backdrop-blur-[1px] sm:hidden"
        />
        <div className="fixed right-3 top-[76px] z-50 w-[min(290px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.18)] sm:hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Content Repository</div>
              <div className="mt-1 text-sm font-black text-gray-900">Quick Actions</div>
            </div>
            <button
              type="button"
              onClick={() => setMobileModeMenuOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500"
              aria-label="Close repository menu"
            >
              <X size={15} />
            </button>
          </div>
          <div className="space-y-2 p-3">
            <button
              type="button"
              onClick={() => {
                confirmUnsavedLeave(() => {
                  setMode('blogs');
                  setQuery('');
                  setMobileReaderOpen(false);
                  setMobileModeMenuOpen(false);
                });
              }}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${mode === 'blogs' ? 'border border-brand-crimson/15 bg-brand-pink/20 text-brand-crimson' : 'border border-gray-200 bg-gray-50 text-gray-700'}`}
            >
              <span className="flex items-center gap-3 text-sm font-black">
                <BookOpenText size={15} />
                Blog
              </span>
              {mode === 'blogs' ? <Check size={15} /> : null}
            </button>
            <button
              type="button"
              onClick={() => {
                confirmUnsavedLeave(() => {
                  setMode('linkedin');
                  setQuery('');
                  setMobileReaderOpen(false);
                  setMobileModeMenuOpen(false);
                });
              }}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${mode === 'linkedin' ? 'border border-brand-crimson/15 bg-brand-pink/20 text-brand-crimson' : 'border border-gray-200 bg-gray-50 text-gray-700'}`}
            >
              <span className="flex items-center gap-3 text-sm font-black">
                <MessageSquareText size={15} />
                Social Media
              </span>
              {mode === 'linkedin' ? <Check size={15} /> : null}
            </button>
          </div>
        </div>
      </>
    ) : null}
    </>
  );

  return (
    <Layout headerActions={headerActions}>
      {contentRevisionLocked ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/45 backdrop-blur-[2px]">
          <div className="mx-4 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-5 py-4 text-sm font-black text-emerald-800 shadow-[0_22px_60px_rgba(15,23,42,0.16)]">
            <Loader2 size={18} className="animate-spin" />
            {savingRevision ? 'Saving edits...' : revisingBlog ? 'Improving blog...' : 'Improving post...'}
          </div>
        </div>
      ) : null}
      {unsavedConfirm ? (
        <UnsavedEditsModal
          message={unsavedConfirm.message}
          onCancel={() => setUnsavedConfirm(null)}
          onDiscard={unsavedConfirm.onDiscard}
        />
      ) : null}
      <div className="content-repo-page flex h-full min-h-[calc(100vh-64px)] -m-3 flex-col gap-4 p-3 mesh-bg sm:-m-5 sm:gap-5 sm:p-5 lg:-m-6 lg:p-6">
        <div className="sm:hidden">
          <div className="relative min-w-0 max-w-xl flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-gray-400" />
            <input
              className="relative h-11 w-full rounded-2xl border border-gray-200 bg-white py-0 pl-10 pr-4 text-sm font-medium leading-normal text-gray-700 shadow-sm transition-all placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-crimson/20 focus:border-brand-crimson/40 hover:border-gray-300"
              value={query}
              disabled={hasUnsavedRevision}
              onChange={(e) => {
                setQuery(e.target.value);
                setMobileReaderOpen(false);
              }}
              placeholder={mode === 'linkedin' ? 'Search LinkedIn posts...' : 'Search articles...'}
            />
          </div>
        </div>

        {mode === 'linkedin' && isAdmin && selectedSocialIds.length ? (
          <div className="glass-panel rounded-[22px] flex flex-wrap items-center gap-2 px-4 py-3 shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
            <span className="text-sm font-black text-gray-800">{selectedSocialIds.length} selected</span>
            <button type="button" onClick={toggleSelectAllSocial} className="content-repo-action-button rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:border-gray-300">
              {selectedSocialIds.length === socialItems.length ? 'Unselect All' : 'Select All'}
            </button>
            <button type="button" onClick={() => confirmUnsavedLeave(() => deleteSocialPosts(selectedSocialIds))} disabled={deleting} className="content-repo-action-button inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-600 transition-all hover:bg-red-100 disabled:opacity-60">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </button>
            <button type="button" onClick={() => setSelectedSocialIds([])} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700" title="Clear selection">
              <X size={14} />
            </button>
          </div>
        ) : null}

        {mode === 'blogs' && isAdmin && selectedIds.length ? (
          <div className="glass-panel rounded-[22px] flex flex-wrap items-center gap-2 px-4 py-3 shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
            <span className="text-sm font-black text-gray-800">{selectedIds.length} selected</span>
            <button type="button" onClick={toggleSelectAllBlogs} className="content-repo-action-button rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:border-gray-300">
              {selectedIds.length === items.length ? 'Unselect All' : 'Select All'}
            </button>
            <button type="button" onClick={() => confirmUnsavedLeave(() => deletePosts(selectedIds))} disabled={deleting} className="content-repo-action-button inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-600 transition-all hover:bg-red-100 disabled:opacity-60">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </button>
            <button type="button" onClick={() => setSelectedIds([])} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700" title="Clear selection">
              <X size={14} />
            </button>
          </div>
        ) : null}

        {error && (
          <div className="rounded-xl bg-red-50/80 backdrop-blur-md px-5 py-4 text-sm font-semibold text-red-700 border border-red-200/50 shadow-sm animate-fade-in-up stagger-2">
            {error}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 animate-fade-in-up stagger-2 xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
          <section className={`content-repo-list-panel ${mobileReaderOpen ? 'hidden xl:block' : 'block'} min-h-0 overflow-y-auto rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.92))] p-3 shadow-[0_24px_50px_rgba(15,23,42,0.08)] backdrop-blur custom-scrollbar sm:py-4 sm:pl-4 sm:pr-5 xl:h-[calc(100vh-96px)]`}>
            {loading && ((mode === 'blogs' && !items.length) || (mode === 'linkedin' && !socialItems.length)) ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="skeleton h-8 w-48 rounded-md" />
                  <div className="skeleton h-7 w-20 rounded-md" />
                </div>
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="rounded-[22px] border border-gray-100 bg-white p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="skeleton h-7 w-7 rounded" />
                      <div className="skeleton h-4 w-16 rounded" />
                    </div>
                    <div className="skeleton mb-2 h-6 w-28 rounded" />
                    <div className="skeleton h-3 w-full rounded" />
                  </div>
                ))}
              </div>
            ) : mode === 'linkedin' ? (
              socialItems.length ? (
              <div className="space-y-3">
                {socialItems.map((post) => {
                  const isSelected = selectedSocial?._id === post._id;
                  const isMarked = selectedSocialIds.includes(post._id);
                  return (
                    <div
                      key={post._id}
                      className={`content-repo-list-card w-full rounded-[22px] border p-4 text-left transition-all duration-300 relative overflow-hidden ${
                        isSelected ? 'content-repo-list-card-selected border-brand-crimson/35 bg-white shadow-[0_18px_36px_rgba(22,58,36,0.12)]' : 'border-white/50 bg-white/72 hover:bg-white hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]'
                      }`}
                    >
                      {isSelected && (
                        <div className="content-repo-selected-line absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brand-crimson to-brand-pink rounded-l-xl"></div>
                      )}
                      <div className="flex items-start gap-3">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => toggleSocialSelection(post._id)}
                            className={`mt-0.5 rounded-lg p-1 transition-all ${isMarked ? 'text-brand-crimson' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
                            title={isMarked ? 'Unselect' : 'Select'}
                          >
                            {isMarked ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            confirmUnsavedLeave(() => {
                              setSelectedSocial(post);
                              setSocialFeedback('');
                              openReaderOnSmallScreens();
                            });
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="rounded-full border border-brand-crimson/10 bg-brand-pink/50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-brand-crimson shadow-sm">LinkedIn</span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">{post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}</span>
                          </div>
                          <div className="line-clamp-2 text-sm font-black leading-snug text-gray-900">{post.selectedTopic || 'Saved LinkedIn post'}</div>
                          <p className="mt-2 line-clamp-3 text-xs font-medium leading-relaxed text-gray-500">{post.postText}</p>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {socialHasMore ? (
                  <div ref={socialLoadMoreRef} className="flex items-center justify-center py-3 text-xs font-bold text-gray-400">
                    {loadingSocial ? 'Loading more...' : 'Scroll for more'}
                  </div>
                ) : null}
              </div>
              ) : <Empty label="No saved LinkedIn posts yet" />
            ) : items.length ? (
              <div className="space-y-3">
                {items.map((blog) => {
                  const isSelected = selected?._id === blog._id;
                  return (
                    <div
                      key={blog._id}
                      className={`content-repo-list-card w-full text-left transition-all duration-300 rounded-[22px] p-4 border relative overflow-hidden group ${
                        isSelected 
                          ? 'content-repo-list-card-selected border-brand-crimson/35 bg-white shadow-[0_18px_36px_rgba(22,58,36,0.12)]' 
                          : 'border-white/50 bg-white/72 hover:bg-white hover:border-white hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]'
                      }`}
                    >
                      {isSelected && (
                        <div className="content-repo-selected-line absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brand-crimson to-brand-pink rounded-l-xl"></div>
                      )}
                      <div className="flex items-start gap-3">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => toggleSelection(blog._id)}
                            className={`mt-0.5 rounded-lg p-1 transition-all ${selectedIds.includes(blog._id) ? 'text-brand-crimson' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
                            title={selectedIds.includes(blog._id) ? 'Unselect' : 'Select'}
                          >
                            {selectedIds.includes(blog._id) ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            confirmUnsavedLeave(() => {
                              setSelected(blog);
                              setBlogFeedback('');
                              openReaderOnSmallScreens();
                            });
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm ${
                                isSelected
                                  ? 'border-brand-crimson/20 bg-brand-pink/20 text-brand-crimson'
                                  : 'border-brand-crimson/10 bg-brand-pink/50 text-brand-crimson'
                              }`}>
                                Blog
                              </span>
                            </div>
                            <span className="shrink-0 text-[10px] font-bold text-gray-400">
                              {(blog.publishedAt || blog.updatedAt || blog.createdAt) ? new Date(blog.publishedAt || blog.updatedAt || blog.createdAt).toLocaleDateString() : ''}
                            </span>
                          </div>
                          <div className={`mb-2 text-base font-black leading-snug ${isSelected ? 'text-gray-900' : 'text-gray-800 group-hover:text-gray-900'}`}>
                            {blog.title}
                          </div>
                          <p className="mb-3 line-clamp-2 text-xs font-medium leading-relaxed text-gray-500">{blog.excerpt}</p>
                          
                          <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
                            {blog.category && <span className={`rounded-full px-2.5 py-1 border shadow-sm ${isSelected ? 'bg-brand-pink/10 border-brand-crimson/20 text-brand-crimson' : 'bg-white border-gray-200'}`}>{blog.category}</span>}
                            {blog.type && <span className={`rounded-full px-2.5 py-1 border shadow-sm ${isSelected ? 'bg-brand-pink/10 border-brand-crimson/20 text-brand-crimson' : 'bg-white border-gray-200'}`}>{blog.type}</span>}
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {blogHasMore ? (
                  <div ref={blogLoadMoreRef} className="flex items-center justify-center py-3 text-xs font-bold text-gray-400">
                    {loadingBlogs ? 'Loading more...' : 'Scroll for more'}
                  </div>
                ) : null}
              </div>
            ) : (
              <Empty />
            )}
          </section>

          <article className={`content-repo-reader ${mobileReaderOpen ? 'block' : 'hidden xl:block'} min-h-0 overflow-y-auto rounded-[28px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,255,255,0.98))] p-4 shadow-[0_24px_50px_rgba(15,23,42,0.08)] backdrop-blur custom-scrollbar relative sm:p-8 xl:h-[calc(100vh-96px)] xl:p-10`}>
            <div className="sticky top-0 z-10 -mx-4 mb-5 border-b border-gray-100 bg-white/96 px-4 py-3 backdrop-blur xl:hidden">
              <button
                type="button"
                onClick={() => confirmUnsavedLeave(() => setMobileReaderOpen(false))}
                className="content-repo-back-button inline-flex min-h-[42px] items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-gray-800 shadow-sm transition-all hover:border-brand-crimson/30 hover:text-brand-crimson"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-brand-crimson shadow-sm">
                  <ArrowLeft size={14} />
                </span>
                <span>Back to posts</span>
              </button>
            </div>
            {mode === 'linkedin' ? (
              selectedSocial ? (
                <div className="mx-auto max-w-6xl animate-fade-in-up">
                  <div className="content-repo-toolbar mb-5 rounded-[22px] border border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,252,0.98))] p-3 shadow-[0_14px_32px_rgba(15,23,42,0.06)] sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <Pill icon={MessageSquareText} highlight>LinkedIn</Pill>
                      {selectedSocial.framework && <Pill icon={Tag}>{selectedSocial.framework}</Pill>}
                      {selectedSocial.createdAt && <Pill icon={CalendarDays}>{new Date(selectedSocial.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Pill>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={copySocialPost}
                        className={`content-repo-copy-button inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-sm transition-all ${
                          copied
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-brand-crimson/15 bg-brand-pink/35 text-brand-crimson hover:border-brand-crimson/30 hover:bg-brand-pink/50'
                        }`}
                      >
                        {copied ? <CheckSquare size={14} /> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="min-w-0">
                      <h2 className="mb-5 text-3xl font-black leading-tight text-gray-900 text-gradient">{selectedSocial.selectedTopic || 'Saved LinkedIn post'}</h2>
                      <div className="content-repo-social-preview rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-crimson text-xs font-black text-white">A</div>
                          <div>
                            <div className="text-sm font-black text-gray-900">Admin</div>
                            <div className="text-xs font-semibold text-gray-400">LinkedIn post</div>
                          </div>
                        </div>
                        <div className="whitespace-pre-wrap text-[15px] font-medium leading-loose text-gray-800">{selectedSocial.postText}</div>
                        {Array.isArray(selectedSocial.hashtags) && selectedSocial.hashtags.length ? (
                          <div className="mt-4 break-words text-sm font-bold leading-relaxed text-brand-crimson">{selectedSocial.hashtags.join(' ')}</div>
                        ) : null}
                      </div>
                    </div>
                    {isAdmin ? (
                      <aside className="order-last lg:order-none">
                        <div className="lg:sticky lg:top-4">
                          <ImproveFeedbackPanel
                            value={socialFeedback}
                            onChange={setSocialFeedback}
                            onSubmit={improveSelectedSocial}
                            loading={revisingSocial}
                            title="Improve with feedback"
                            description="Ask AI to revise this same draft while keeping the post useful and source grounded."
                            placeholder="Example: Make the hook sharper, reduce hype, add a clearer advisory CTA."
                          buttonLabel="Improve Post"
                          loadingLabel="Improving Post..."
                          dirty={socialDraftDirty}
                          onSave={saveSocialRevision}
                          saving={savingRevision}
                        />
                        </div>
                      </aside>
                    ) : null}
                  </div>
                </div>
              ) : <Empty large />
            ) : selected ? (
              <div className="mx-auto max-w-6xl animate-fade-in-up">
                <div className="content-repo-toolbar mb-6 rounded-[22px] border border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,252,0.98))] p-3 shadow-[0_14px_32px_rgba(15,23,42,0.06)] sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2.5">
                    {selected.category && <Pill icon={Tag}>{selected.category}</Pill>}
                    {selected.subcategory && <Pill icon={Tag}>{selected.subcategory}</Pill>}
                    {selected.publishedAt && <Pill icon={CalendarDays} highlight>{new Date(selected.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Pill>}
                  </div>
                  <button
                    type="button"
                    onClick={copyBlogPost}
                    className={`content-repo-copy-button inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-sm transition-all ${
                      copied
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-brand-crimson/15 bg-brand-pink/35 text-brand-crimson hover:border-brand-crimson/30 hover:bg-brand-pink/50'
                    }`}
                  >
                      {copied ? <CheckSquare size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0">
                    <h2 className="text-3xl sm:text-4xl font-black leading-tight text-gray-900 mb-6 font-display tracking-tight text-gradient">{selected.title}</h2>
                    
                    {selected.excerpt && (
                      <div className="pl-4 border-l-4 border-brand-crimson/30 mb-8 py-1">
                        <p className="text-lg font-medium leading-relaxed text-gray-600 italic">
                          {selected.excerpt}
                        </p>
                      </div>
                    )}
                    
                    <div
                      ref={blogPreviewRef}
                      onMouseUp={captureBlogSelection}
                      onKeyUp={captureBlogSelection}
                      className="max-w-none"
                    >
                      <div className="text-gray-800">
                        <MarkdownArticle bodyMarkdown={selected.bodyMarkdown} title={selected.title} />
                      </div>
                    </div>
                  </div>
                  <aside className="order-last lg:order-none">
                    <div className="lg:sticky lg:top-4">
                      {isAdmin ? (
                        <ImproveFeedbackPanel
                          value={blogFeedback}
                          onChange={setBlogFeedback}
                          onSubmit={improveSelectedBlog}
                          loading={revisingBlog}
                          title="Improve with feedback"
                          description="Ask AI to revise this same draft while keeping the SOP format and source grounding."
                          placeholder="Example: Make the intro stronger, reduce repetition, add practical steps, and keep the CTA advisory."
                          buttonLabel="Improve Blog"
                          loadingLabel="Improving Blog..."
                          dirty={blogDraftDirty}
                          onSave={saveBlogRevision}
                          saving={savingRevision}
                        />
                      ) : null}
                      <ReviewCommentsPanel
                        comments={selected.reviewComments || []}
                        selectedTarget={selectedCommentTarget}
                        onClearSelectedTarget={() => setSelectedCommentTarget(null)}
                        value={blogComment}
                        onChange={setBlogComment}
                        onSubmit={submitBlogComment}
                        onJumpToSelection={scrollToBlogCommentSelection}
                        onUpdate={updateBlogComment}
                        onDelete={deleteBlogComment}
                        loading={submittingComment}
                        updatingCommentId={updatingCommentId}
                        deletingCommentId={deletingCommentId}
                      />
                    </div>
                  </aside>
                </div>
              </div>
            ) : (
              <Empty large />
            )}
          </article>
        </div>
      </div>
    </Layout>
  );
}

function ImproveFeedbackPanel({
  value,
  onChange,
  onSubmit,
  loading = false,
  title = 'Improve with feedback',
  description = '',
  placeholder = '',
  buttonLabel = 'Improve Post',
  loadingLabel = 'Improving...',
  dirty = false,
  onSave,
  saving = false
}) {
  return (
    <div className="content-repo-improve-panel mb-7 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-emerald-700">{title}</div>
          {description ? (
            <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-900/70">{description}</p>
          ) : null}
        </div>
        <Sparkles size={18} className="shrink-0 text-emerald-700" />
      </div>
      <textarea
        className="content-repo-improve-input input min-h-[96px] resize-y rounded-xl bg-white text-sm transition-colors hover:border-emerald-200 focus:border-emerald-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || !String(value || '').trim()}
        className="content-repo-improve-button mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white py-3 text-sm font-black text-emerald-700 transition-all hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {loading ? loadingLabel : buttonLabel}
      </button>
      {dirty ? (
        <button
          type="button"
          onClick={onSave}
          disabled={saving || loading}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-crimson py-3 text-sm font-black text-white transition-all hover:bg-brand-hoverred disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {saving ? 'Saving...' : 'Save Edits'}
        </button>
      ) : null}
    </div>
  );
}

function ReviewCommentsPanel({
  comments = [],
  selectedTarget = null,
  onClearSelectedTarget,
  value,
  onChange,
  onSubmit,
  onJumpToSelection,
  onUpdate,
  onDelete,
  loading = false,
  updatingCommentId = '',
  deletingCommentId = ''
}) {
  const sortedComments = [...comments].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return (
    <div className="content-repo-comments-panel rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-gray-700">Review Comments</div>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-gray-500">Select text in the article, then add a note for review.</p>
        </div>
        <MessageSquareText size={18} className="shrink-0 text-gray-500" />
      </div>
      {selectedTarget?.selectedText ? (
        <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Selected Text</span>
            <button
              type="button"
              onClick={onClearSelectedTarget}
              className="rounded-lg border border-emerald-100 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 transition-all hover:border-emerald-200 hover:bg-emerald-50"
            >
              Clear
            </button>
          </div>
          <p className="line-clamp-4 border-l-2 border-emerald-300 pl-3 text-xs font-semibold leading-relaxed text-emerald-950/75">
            {selectedTarget.selectedText}
          </p>
        </div>
      ) : null}
      <textarea
        className="input min-h-[86px] resize-y rounded-xl bg-gray-50 text-sm transition-colors hover:border-gray-200 focus:border-brand-crimson/50"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Write a review comment..."
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || !String(value || '').trim()}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-crimson py-3 text-sm font-black text-white transition-all hover:bg-brand-hoverred disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <MessageSquareText size={16} />}
        {loading ? 'Saving Comment...' : 'Add Comment'}
      </button>
      <div className="mt-4 space-y-3">
        {sortedComments.length ? sortedComments.map((comment) => (
          <div key={comment._id || `${comment.createdAt}-${comment.text}`} className={`rounded-xl border p-3 ${comment.resolved ? 'border-gray-100 bg-gray-50/70 opacity-75' : 'border-gray-100 bg-gray-50/80'}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-black text-gray-800">{comment.authorName || 'Reviewer'}</span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ''}
                </span>
                {comment._id ? (
                  <>
                  <button
                    type="button"
                    onClick={() => onUpdate?.(comment._id, { resolved: !comment.resolved })}
                    disabled={Boolean(updatingCommentId)}
                    className={`inline-flex h-7 items-center justify-center rounded-lg border px-2 text-[10px] font-black uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                      comment.resolved
                        ? 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                        : 'border-emerald-100 bg-white text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50'
                    }`}
                    title={comment.resolved ? 'Reopen comment' : 'Resolve comment'}
                  >
                    {updatingCommentId === comment._id ? <Loader2 size={13} className="animate-spin" /> : comment.resolved ? 'Open' : 'Resolve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete?.(comment._id)}
                    disabled={Boolean(deletingCommentId)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-100 bg-white text-red-500 transition-all hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Delete comment"
                    aria-label="Delete comment"
                  >
                    {deletingCommentId === comment._id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                  </>
                ) : null}
              </div>
            </div>
            {comment.selectedText ? (
              <button
                type="button"
                onClick={() => onJumpToSelection?.(comment)}
                className="mb-2 block w-full rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-left transition-all hover:border-amber-200 hover:bg-amber-100/70 focus:outline-none focus:ring-2 focus:ring-amber-300"
                title="Jump to this selection in the article"
              >
                <div className="mb-1 text-[9px] font-black uppercase tracking-[0.16em] text-amber-700">Commented Selection</div>
                <p className="line-clamp-4 border-l-2 border-amber-300 pl-2 text-xs font-semibold leading-relaxed text-amber-950/75">
                  {comment.selectedText}
                </p>
              </button>
            ) : null}
            <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-gray-600">{comment.text}</p>
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-3 py-4 text-center text-xs font-bold text-gray-400">
            No review comments yet.
          </div>
        )}
      </div>
    </div>
  );
}

function UnsavedEditsModal({
  title = 'Discard unsaved edits?',
  message = 'You have unsaved changes. Discard them and continue, or keep editing.',
  onCancel,
  onDiscard
}) {
  return (
    <div data-unsaved-edits-modal className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-950/60 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-[26px] border border-gray-200 bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.30)] sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <FileText size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-base font-black text-gray-900">{title}</div>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-gray-500">{message}</p>
          </div>
        </div>
        <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
          >
            Keep Editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-crimson px-4 text-sm font-black text-white shadow-sm ring-2 ring-brand-crimson ring-offset-2 transition-all hover:bg-brand-hoverred"
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({ icon: Icon, children, highlight = false }) {
  return (
    <span className={`content-repo-pill ${highlight ? 'content-repo-pill-highlight' : ''} inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] border shadow-sm transition-all ${
      highlight 
        ? 'border-brand-hoverred bg-brand-crimson text-white shadow-[0_10px_24px_rgba(22,58,36,0.18)]' 
        : 'border-gray-200 bg-white text-gray-600 shadow-[0_8px_18px_rgba(15,23,42,0.05)]'
    }`}>
      <Icon size={12} />
      {children}
    </span>
  );
}

function contentStatusLabel(status) {
  if (status === 'published') return 'Published';
  if (status === 'archived') return 'Archived';
  return 'Review';
}

function StatusPill({ status }) {
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
      status === 'published' ? 'border-emerald-200 bg-emerald-50 text-emerald-600' :
      ['review', 'draft'].includes(status) ? 'border-amber-200 bg-amber-50 text-amber-600' :
      'border-gray-200 bg-gray-50 text-gray-500'
    }`}>
      {contentStatusLabel(status)}
    </span>
  );
}

function Empty({ large = false, label }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 text-center h-full min-h-[300px] ${large ? 'px-10' : 'px-6'}`}>
      <div className="relative">
        <div className="absolute inset-0 bg-brand-crimson/5 blur-xl rounded-full"></div>
        <div className="relative bg-white p-4 rounded-full shadow-sm border border-gray-100">
          <FileText size={large ? 32 : 24} className="text-brand-crimson/40" />
        </div>
      </div>
      <div>
        <h3 className={`font-black text-gray-800 ${large ? 'text-xl mb-2' : 'text-base mb-1'}`}>No content available</h3>
        <p className="text-sm font-medium text-gray-500 max-w-xs mx-auto">
          {label || (large ? "Select a post from the list to read the full content." : "There is no content to display right now.")}
        </p>
      </div>
    </div>
  );
}
