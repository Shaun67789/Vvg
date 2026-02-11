import JSZip from 'jszip';
import { FileNode } from '../types';

export class ZipService {
  
  async processFile(file: File): Promise<FileNode[]> {
    const fileNodes: FileNode[] = [];

    if (file.name.endsWith('.zip')) {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);
      
      const entries = Object.keys(loadedZip.files).map(name => loadedZip.files[name]);
      
      for (const entry of entries) {
        if (!entry.dir) {
          // Read as base64 to ensure binary compatibility with GitHub API
          const content = await entry.async('base64');
          fileNodes.push({
            path: entry.name,
            content: content,
            isBinary: true, // We treat all as base64 for simplicity in upload
            size: content.length
          });
        }
      }
    } else {
      // Single file upload
      const buffer = await file.arrayBuffer();
      // Convert ArrayBuffer to Base64
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      fileNodes.push({
        path: file.name,
        content: base64,
        isBinary: true,
        size: file.size
      });
    }

    return fileNodes;
  }
}

export const zipService = new ZipService();
