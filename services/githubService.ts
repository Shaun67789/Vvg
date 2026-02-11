import { Octokit } from '@octokit/rest';
import { FileNode, RepoConfig, UserProfile, TokenVerification } from '../types';

export class GitHubService {
  private octokit: Octokit | null = null;

  initialize(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async verifyToken(token: string): Promise<TokenVerification> {
    try {
      const octokit = new Octokit({ auth: token });
      
      // 1. Check user and scopes
      const { data: user, headers } = await octokit.rest.users.getAuthenticated();
      
      const scopesHeader = headers['x-oauth-scopes'] || '';
      const scopes = scopesHeader.split(',').map(s => s.trim());
      
      const hasRepoScope = scopes.includes('repo') || scopes.includes('public_repo'); // public_repo is technically enough for public, but we prefer full repo
      
      return {
        isValid: true,
        scopes,
        user: {
          login: user.login,
          avatar_url: user.avatar_url,
          name: user.name || user.login
        }
      };
    } catch (error: any) {
      return {
        isValid: false,
        scopes: [],
        user: null,
        error: error.message || "Invalid Token"
      };
    }
  }

  async checkRepoExists(owner: string, repo: string): Promise<boolean> {
    if (!this.octokit) throw new Error("GitHub client not initialized");
    try {
      await this.octokit.rest.repos.get({ owner, repo });
      return true;
    } catch (e: any) {
      if (e.status === 404) return false;
      throw e;
    }
  }

  async createRepository(config: RepoConfig): Promise<any> {
    if (!this.octokit) throw new Error("GitHub client not initialized");
    
    // 1. Create the repository
    const { data: repo } = await this.octokit.rest.repos.createForAuthenticatedUser({
      name: config.name,
      description: config.description,
      private: config.isPrivate,
      auto_init: true // Initialize with README to get a HEAD ref easily
    });

    return repo;
  }

  async uploadFiles(owner: string, repo: string, files: FileNode[], onProgress: (msg: string) => void): Promise<string> {
    if (!this.octokit) throw new Error("GitHub client not initialized");

    onProgress("Getting latest commit SHA...");
    // 1. Get the current commit object
    const { data: refData } = await this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: 'heads/main', 
    }).catch(async () => {
       // Fallback for some repos that default to master
       const { data } = await this.octokit!.rest.git.getRef({
         owner,
         repo,
         ref: 'heads/master',
       });
       return { data };
    });
    
    if (!refData) throw new Error("Could not find heads/main or heads/master");

    const latestCommitSha = refData.object.sha;
    const refName = refData.ref;

    onProgress("Getting base tree...");
    const { data: commitData } = await this.octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });
    const baseTreeSha = commitData.tree.sha;

    // 2. Create Blobs for each file
    const treeItems: any[] = [];
    let processed = 0;

    // Chunking to avoid rate limits or browser hanging
    const chunkSize = 5;
    for (let i = 0; i < files.length; i += chunkSize) {
      const chunk = files.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (file) => {
        try {
          if (!file.content && file.size > 0) return;

          const { data: blob } = await this.octokit!.rest.git.createBlob({
            owner,
            repo,
            content: file.content,
            encoding: 'base64',
          });
          
          treeItems.push({
            path: file.path,
            mode: '100644', // file mode
            type: 'blob',
            sha: blob.sha,
          });
        } catch (err) {
          console.error(`Failed to upload blob for ${file.path}`, err);
          throw new Error(`Failed to upload ${file.path}`);
        }
      }));
      processed += chunk.length;
      onProgress(`Uploaded ${processed}/${files.length} blobs...`);
    }

    // 3. Create a new Tree
    onProgress("Creating new file tree...");
    const { data: newTree } = await this.octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeItems,
    });

    // 4. Create a new Commit
    onProgress("Creating commit...");
    const { data: newCommit } = await this.octokit.rest.git.createCommit({
      owner,
      repo,
      message: 'Deploy from GitZip AI Deployer',
      tree: newTree.sha,
      parents: [latestCommitSha],
    });

    // 5. Update Ref
    onProgress("Updating repository reference...");
    await this.octokit.rest.git.updateRef({
      owner,
      repo,
      ref: refName.replace('refs/', ''),
      sha: newCommit.sha,
    });

    return `https://github.com/${owner}/${repo}`;
  }
}

export const githubService = new GitHubService();
