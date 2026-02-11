import { GoogleGenAI, Type } from '@google/genai';
import { RepoConfig } from '../types';

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // API Key must be from process.env.API_KEY
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateRepoDetails(filePaths: string[]): Promise<Partial<RepoConfig>> {
    const fileList = filePaths.slice(0, 50).join('\n'); // Limit context
    
    const prompt = `
      I have a list of files that I am uploading to a GitHub repository.
      Based on the file names and directory structure, please generate:
      1. A creative and relevant repository name (kebab-case).
      2. A short, professional description.
      3. A concise README.md content summary explaining what this project likely does.
      
      Files:
      ${fileList}
      
      ... (and ${Math.max(0, filePaths.length - 50)} more files)
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              readmeContent: { type: Type.STRING }
            },
            required: ['name', 'description', 'readmeContent']
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");
      
      const json = JSON.parse(text);
      return {
        name: json.name,
        description: json.description,
        readmeContent: json.readmeContent
      };
    } catch (error) {
      console.error("Gemini AI Error:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
