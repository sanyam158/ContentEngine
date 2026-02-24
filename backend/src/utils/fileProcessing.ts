import { Request } from 'express';
import fs from 'fs/promises';
import path from 'path';

class FileProcessingService {
  // Extract text from uploaded file (text only for now)
  async extractTextFile(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('File reading error:', error);
      throw new Error(`Failed to extract text from file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Process uploaded file (text and PDF files)
  async processUploadedFile(file: Express.Multer.File): Promise<string> {
    try {
      // Support text files, markdown, and PDF
      const supportedTypes = ['text/plain', 'text/markdown', 'application/octet-stream', 'application/pdf'];
      const supportedExtensions = ['.txt', '.md', '.pdf'];
      const ext = file.originalname ? path.extname(file.originalname).toLowerCase() : '';
      
      if (!supportedTypes.some(type => file.mimetype.includes(type)) && !supportedExtensions.includes(ext)) {
        throw new Error(`Unsupported file type: ${file.mimetype}. Please upload a .txt, .md, or .pdf file.`);
      }
      
      return await this.extractTextFile(file.path);
    } catch (error) {
      throw error;
    } finally {
      // Clean up uploaded file
      try {
        await fs.unlink(file.path);
      } catch (e) {
        console.warn('Failed to delete temp file:', e);
      }
    }
  }

  // Validate and clean script text
  cleanScript(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive blank lines
      .trim();
  }

  // Split long scripts into sections
  splitIntoSections(script: string, maxChars: number = 2000): string[] {
    const sections: string[] = [];
    const paragraphs = script.split('\n\n');

    let currentSection = '';

    for (const paragraph of paragraphs) {
      if ((currentSection + paragraph).length > maxChars && currentSection.length > 0) {
        sections.push(currentSection.trim());
        currentSection = paragraph;
      } else {
        currentSection += (currentSection ? '\n\n' : '') + paragraph;
      }
    }

    if (currentSection.length > 0) {
      sections.push(currentSection.trim());
    }

    return sections;
  }

  // Estimate reading time
  estimateReadingTime(text: string): number {
    const words = text.split(/\s+/).length;
    const wordsPerMinute = 200;
    return Math.ceil(words / wordsPerMinute);
  }

  // Extract key topics from script
  extractTopics(script: string): string[] {
    // Simple keyword extraction - can be enhanced
    const keywords: string[] = [];
    const words = script.toLowerCase().split(/\s+/);

    // Look for capitalized phrases (likely titles/topics)
    const phrases = script.match(/[A-Z][a-zA-Z\s]+(?=[.!?\n])/g) || [];

    return [...new Set([...keywords, ...phrases])].slice(0, 5);
  }
}

export default FileProcessingService;