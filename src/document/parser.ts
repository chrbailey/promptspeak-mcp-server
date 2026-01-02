/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DOCUMENT PARSER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Parses various document formats (PDF, text, markdown) into structured text
 * for symbol extraction.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

import type {
  DocumentSource,
  ParsedDocument,
  DocumentSection,
  DocumentType,
} from './types.js';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT PARSER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class DocumentParser {
  /**
   * Parse a document from various sources
   */
  async parse(source: DocumentSource): Promise<ParsedDocument> {
    const startTime = Date.now();

    let text: string;
    let pageCount: number | undefined;

    // Get text content based on source type
    if (source.content) {
      text = source.content;
    } else if (source.path) {
      const result = await this.parseFile(source.path, source.type);
      text = result.text;
      pageCount = result.pageCount;
    } else if (source.url) {
      text = await this.fetchUrl(source.url);
    } else {
      throw new Error('Document source must have content, path, or url');
    }

    // Extract sections if possible
    const sections = this.extractSections(text, source.type);

    // Extract title from metadata or first heading
    const title = source.metadata?.title || this.extractTitle(text, sections);

    return {
      source,
      text,
      sections,
      metadata: {
        title,
        wordCount: this.countWords(text),
        charCount: text.length,
        pageCount,
        extractedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Detect document type from file extension
   */
  detectType(filePath: string): DocumentType {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.pdf':
        return 'pdf';
      case '.md':
      case '.markdown':
        return 'markdown';
      case '.html':
      case '.htm':
        return 'html';
      case '.txt':
      default:
        return 'text';
    }
  }

  /**
   * Parse a local file
   */
  private async parseFile(
    filePath: string,
    type?: DocumentType
  ): Promise<{ text: string; pageCount?: number }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const detectedType = type || this.detectType(filePath);

    switch (detectedType) {
      case 'pdf':
        return this.parsePdf(filePath);
      case 'html':
        return { text: this.parseHtml(fs.readFileSync(filePath, 'utf-8')) };
      case 'markdown':
      case 'text':
      default:
        return { text: fs.readFileSync(filePath, 'utf-8') };
    }
  }

  /**
   * Parse PDF using pdftotext (poppler-utils)
   */
  private async parsePdf(filePath: string): Promise<{ text: string; pageCount?: number }> {
    try {
      // Try pdftotext first (most common on Linux/Mac)
      const { stdout } = await execAsync(`pdftotext -layout "${filePath}" -`);

      // Count pages by looking for form feed characters or page breaks
      const pageBreaks = (stdout.match(/\f/g) || []).length;
      const pageCount = pageBreaks > 0 ? pageBreaks + 1 : undefined;

      return { text: stdout, pageCount };
    } catch (error) {
      // Fallback: try textutil on macOS
      try {
        const { stdout } = await execAsync(`textutil -convert txt -stdout "${filePath}"`);
        return { text: stdout };
      } catch {
        throw new Error(
          `Failed to parse PDF. Ensure pdftotext (poppler-utils) is installed.\n` +
          `On macOS: brew install poppler\n` +
          `On Ubuntu: apt-get install poppler-utils\n` +
          `Original error: ${error}`
        );
      }
    }
  }

  /**
   * Parse HTML by stripping tags
   */
  private parseHtml(html: string): string {
    // Remove script and style elements
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Convert common block elements to newlines
    text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n');

    // Remove remaining tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));

    // Clean up whitespace
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n\s*\n/g, '\n\n');
    text = text.trim();

    return text;
  }

  /**
   * Fetch content from URL
   */
  private async fetchUrl(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/pdf')) {
        // For PDFs, we'd need to download and parse
        throw new Error('Direct PDF URL fetching not supported. Download the file first.');
      }

      const text = await response.text();

      // If HTML, strip tags
      if (contentType.includes('text/html')) {
        return this.parseHtml(text);
      }

      return text;
    } catch (error) {
      throw new Error(`Failed to fetch URL ${url}: ${error}`);
    }
  }

  /**
   * Extract sections from document text
   */
  private extractSections(text: string, type?: DocumentType): DocumentSection[] {
    const sections: DocumentSection[] = [];

    // Define section patterns based on document type
    const patterns = this.getSectionPatterns(type);

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern.regex);

      for (const match of matches) {
        const heading = match[1]?.trim();
        const startIndex = match.index || 0;

        sections.push({
          heading,
          content: '', // Will be filled in after all sections found
          type: pattern.type,
          startIndex,
          endIndex: startIndex, // Will be updated
        });
      }
    }

    // Sort by start index
    sections.sort((a, b) => a.startIndex - b.startIndex);

    // Fill in content and end indices
    for (let i = 0; i < sections.length; i++) {
      const currentSection = sections[i];
      const nextSection = sections[i + 1];

      currentSection.endIndex = nextSection ? nextSection.startIndex : text.length;
      currentSection.content = text
        .slice(currentSection.startIndex, currentSection.endIndex)
        .trim();
    }

    // If no sections found, create one for entire document
    if (sections.length === 0 && text.length > 0) {
      sections.push({
        content: text,
        startIndex: 0,
        endIndex: text.length,
      });
    }

    return sections;
  }

  /**
   * Get section detection patterns based on document type
   */
  private getSectionPatterns(
    type?: DocumentType
  ): Array<{ regex: RegExp; type: string }> {
    const commonPatterns = [
      // SEC filing sections
      { regex: /^(?:PART\s+[IVX]+)[.\s]*(.*)$/gim, type: 'sec_part' },
      { regex: /^(?:ITEM\s+\d+)[.\s]*(.*)$/gim, type: 'sec_item' },

      // Common financial document sections
      { regex: /^(?:Executive\s+Summary)[:\s]*(.*)$/gim, type: 'executive_summary' },
      { regex: /^(?:Risk\s+Factors)[:\s]*(.*)$/gim, type: 'risks' },
      { regex: /^(?:Management['']s?\s+Discussion)[:\s]*(.*)$/gim, type: 'mda' },
      { regex: /^(?:Financial\s+Statements)[:\s]*(.*)$/gim, type: 'financials' },
      { regex: /^(?:Business\s+Overview)[:\s]*(.*)$/gim, type: 'business' },
      { regex: /^(?:Competitive\s+Analysis)[:\s]*(.*)$/gim, type: 'competitive' },
      { regex: /^(?:Forward[- ]Looking\s+Statements)[:\s]*(.*)$/gim, type: 'forward_looking' },

      // Earnings call sections
      { regex: /^(?:Prepared\s+Remarks)[:\s]*(.*)$/gim, type: 'prepared_remarks' },
      { regex: /^(?:Q&A\s+Session|Questions?\s+and\s+Answers?)[:\s]*(.*)$/gim, type: 'qa' },
      { regex: /^(?:Opening\s+Remarks)[:\s]*(.*)$/gim, type: 'opening' },
      { regex: /^(?:Closing\s+Remarks)[:\s]*(.*)$/gim, type: 'closing' },
    ];

    // Add markdown-specific patterns
    if (type === 'markdown') {
      return [
        { regex: /^#{1,3}\s+(.+)$/gm, type: 'heading' },
        ...commonPatterns,
      ];
    }

    return commonPatterns;
  }

  /**
   * Extract document title
   */
  private extractTitle(text: string, sections: DocumentSection[]): string | undefined {
    // Try first section heading
    if (sections.length > 0 && sections[0].heading) {
      return sections[0].heading;
    }

    // Try first non-empty line
    const firstLine = text.split('\n').find((line) => line.trim().length > 0);
    if (firstLine && firstLine.length < 200) {
      return firstLine.trim();
    }

    return undefined;
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  /**
   * Chunk document into smaller pieces for processing
   */
  chunkDocument(
    doc: ParsedDocument,
    maxChunkSize: number = 8000
  ): Array<{ text: string; section?: string; chunkIndex: number }> {
    const chunks: Array<{ text: string; section?: string; chunkIndex: number }> = [];
    let chunkIndex = 0;

    // If document has sections, try to chunk by section first
    if (doc.sections && doc.sections.length > 1) {
      for (const section of doc.sections) {
        if (section.content.length <= maxChunkSize) {
          chunks.push({
            text: section.content,
            section: section.heading || section.type,
            chunkIndex: chunkIndex++,
          });
        } else {
          // Split large sections
          const sectionChunks = this.splitText(section.content, maxChunkSize);
          for (const chunk of sectionChunks) {
            chunks.push({
              text: chunk,
              section: section.heading || section.type,
              chunkIndex: chunkIndex++,
            });
          }
        }
      }
    } else {
      // No sections, split entire text
      const textChunks = this.splitText(doc.text, maxChunkSize);
      for (const chunk of textChunks) {
        chunks.push({
          text: chunk,
          chunkIndex: chunkIndex++,
        });
      }
    }

    return chunks;
  }

  /**
   * Split text into chunks at sentence boundaries
   */
  private splitText(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // If single sentence is too long, split by words
        if (sentence.length > maxChunkSize) {
          const words = sentence.split(/\s+/);
          let wordChunk = '';

          for (const word of words) {
            if (wordChunk.length + word.length + 1 > maxChunkSize) {
              chunks.push(wordChunk.trim());
              wordChunk = '';
            }
            wordChunk += (wordChunk ? ' ' : '') + word;
          }

          if (wordChunk) {
            currentChunk = wordChunk;
          }
        } else {
          currentChunk = sentence;
        }
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let documentParser: DocumentParser | null = null;

export function getDocumentParser(): DocumentParser {
  if (!documentParser) {
    documentParser = new DocumentParser();
  }
  return documentParser;
}
