import React, { useState, useEffect, useRef } from 'react';
import { 
  Github, Upload, FolderArchive, ArrowRight, Loader2, Wand2, 
  Terminal, CheckCircle, ShieldCheck, FileText, Lock, Globe, Eye, Edit
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import confetti from 'canvas-confetti';

import { Steps } from './components/Steps';
import { Step, UserProfile, FileNode, RepoConfig, LogEntry } from './types';
import { githubService } from './services/githubService';
import { zipService } from './services/zipService';
import { geminiService } from './services/geminiService';

const App: React.FC = () => {
  const [step, setStep] = useState<Step>(Step.AUTH);
  const [token, setToken] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [readmeMode, setReadmeMode] = useState<'edit' | 'preview'>('preview');
  
  // Config State
  const [repoConfig, setRepoConfig] = useState<RepoConfig>({
    name: '',
    description: '',
    isPrivate: false,
    includeReadme: true,
    readmeContent: ''
  });

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Trigger confetti on success
  useEffect(() => {
    if (step === Step.SUCCESS) {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({
          ...defaults, particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        });
        confetti({
          ...defaults, particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [step]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { message, type, timestamp: Date.now() }]);
  };

  // ----------------------------------------------------
  // Handlers
  // ----------------------------------------------------

  const handleVerifyAndConnect = async () => {
    if (!token) return;
    setIsVerifying(true);
    setError(null);
    try {
      // 1. Verify Token and Scopes
      const verification = await githubService.verifyToken(token);
      
      if (!verification.isValid) {
        throw new Error(verification.error || "Token Invalid");
      }
      
      if (!verification.scopes.includes('repo') && !verification.scopes.includes('public_repo')) {
         throw new Error("Token missing 'repo' scope. Please create a new token with full repo permissions.");
      }

      // 2. Initialize Service
      githubService.initialize(token);
      setUser(verification.user);
      setStep(Step.UPLOAD);
    } catch (err: any) {
      setError(err.message || "Connection Failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    try {
      const file = e.target.files[0];
      const processedFiles = await zipService.processFile(file);
      setFiles(processedFiles);
      setStep(Step.CONFIG);
      
      const baseName = file.name.replace(/\.(zip|rar|7z)$/i, '').replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      setRepoConfig(prev => ({ 
        ...prev, 
        name: baseName,
        readmeContent: `# ${baseName}\n\nAutomated deployment via GitZip AI.`
      }));
      // Auto-switch to edit mode initially
      setReadmeMode('edit');

    } catch (err) {
      console.error(err);
      setError("Failed to process file. Ensure it is a valid Zip.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAiGenerate = async () => {
    setIsProcessing(true);
    try {
      const paths = files.map(f => f.path);
      const suggestion = await geminiService.generateRepoDetails(paths);
      setRepoConfig(prev => ({
        ...prev,
        name: suggestion.name || prev.name,
        description: suggestion.description || prev.description,
        readmeContent: suggestion.readmeContent || prev.readmeContent
      }));
      setReadmeMode('preview');
    } catch (err) {
      setError("AI Generation failed. Check API Key configuration.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeploy = async () => {
    if (!user) return;
    setStep(Step.DEPLOY);
    setLogs([]);
    
    try {
      addLog(`Initializing deployment for ${repoConfig.name}...`);
      
      const exists = await githubService.checkRepoExists(user.login, repoConfig.name);
      if (exists) {
        throw new Error(`Repository "${repoConfig.name}" already exists!`);
      }

      addLog("Creating repository...");
      const repo = await githubService.createRepository(repoConfig);
      addLog(`Repository created: ${repo.html_url}`, 'success');

      let filesToUpload = [...files];
      if (repoConfig.includeReadme) {
        filesToUpload = filesToUpload.filter(f => f.path.toLowerCase() !== 'readme.md');
        const readmeB64 = btoa(unescape(encodeURIComponent(repoConfig.readmeContent || ''))); // Robust utf-8 to base64
        filesToUpload.push({
          path: 'README.md',
          content: readmeB64,
          isBinary: false,
          size: readmeB64.length
        });
      }

      addLog(`Preparing to upload ${filesToUpload.length} files...`);
      const url = await githubService.uploadFiles(user.login, repoConfig.name, filesToUpload, (msg) => {
        addLog(msg);
      });

      setDeployUrl(url);
      setStep(Step.SUCCESS);
      addLog("Deployment Successful!", 'success');

    } catch (err: any) {
      addLog(err.message || "Deployment Failed", 'error');
      setError(err.message);
      // Do not revert step immediately so user can read logs
    }
  };

  // ----------------------------------------------------
  // Renderers
  // ----------------------------------------------------

  const renderAuth = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-8 rounded-2xl max-w-md w-full relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500"></div>
      
      <div className="flex flex-col items-center gap-4 mb-8">
        <div className="relative">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-700 shadow-inner">
            <ShieldCheck className="w-8 h-8 text-cyan-400" />
          </div>
          {isVerifying && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500"></span>
            </span>
          )}
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">GitHub Access</h2>
        <p className="text-zinc-400 text-center text-sm leading-relaxed">
          Provide a secure token to allow GitZip to create repositories on your behalf.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Personal Access Token</label>
          <div className="relative group">
            <input 
              type="password" 
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_..."
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder-zinc-700 font-mono text-sm group-hover:border-zinc-700"
            />
            <div className="absolute right-3 top-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors">
               <Lock size={16} />
            </div>
          </div>
        </div>
        
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="text-red-400 text-sm bg-red-950/30 p-3 rounded-lg border border-red-900/50 flex items-start gap-2"
            >
              <span className="mt-0.5">⚠️</span> {error}
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={handleVerifyAndConnect}
          disabled={!token || isVerifying}
          className="w-full bg-white text-black hover:bg-zinc-200 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-white/5 active:scale-[0.98]"
        >
          {isVerifying ? <Loader2 className="animate-spin" /> : 'Verify Token'}
        </button>
      </div>
      
      <div className="mt-6 text-center">
         <a href="https://github.com/settings/tokens/new?scopes=repo&description=GitZip+AI+Deployer" target="_blank" rel="noreferrer" className="text-cyan-500 text-xs hover:text-cyan-400 transition-colors flex items-center justify-center gap-1">
            Create new token <ArrowRight size={10} />
         </a>
      </div>
    </motion.div>
  );

  const renderUpload = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="glass-panel p-10 rounded-2xl max-w-xl w-full text-center relative"
    >
      <h2 className="text-2xl font-bold text-white mb-2">Upload Source</h2>
      <p className="text-zinc-400 text-sm mb-8">Drop your project archive to begin the deployment pipeline.</p>
      
      <label className="group flex flex-col items-center justify-center w-full h-72 border-2 border-dashed border-zinc-700 rounded-2xl cursor-pointer bg-zinc-900/30 hover:bg-zinc-800/50 hover:border-cyan-500/50 transition-all duration-300">
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <div className="p-5 bg-zinc-800 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300 shadow-xl shadow-black/50">
             <FolderArchive className="w-12 h-12 text-cyan-400" />
          </div>
          <p className="mb-2 text-lg text-zinc-200 font-medium group-hover:text-white">Drag & Drop ZIP file</p>
          <p className="text-sm text-zinc-500">Supports .zip, .rar, .7z</p>
        </div>
        <input type="file" className="hidden" onChange={handleFileUpload} accept=".zip,.rar,.7z,*" />
      </label>

      {isProcessing && (
        <div className="mt-6 flex items-center justify-center gap-3 text-cyan-400 bg-cyan-950/20 py-2 rounded-lg border border-cyan-900/30">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-sm font-medium">Analyzing package contents...</span>
        </div>
      )}
      
      {error && <div className="mt-4 text-red-400 text-sm">{error}</div>}
    </motion.div>
  );

  const renderConfig = () => (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      className="glass-panel p-8 rounded-2xl max-w-5xl w-full grid grid-cols-1 lg:grid-cols-3 gap-8"
    >
      {/* Left Column: Form */}
      <div className="lg:col-span-2 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">Project Config</h2>
            <p className="text-zinc-400 text-sm">Review generated settings.</p>
          </div>
          <button 
            onClick={handleAiGenerate}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-500 hover:to-indigo-500 transition-all text-sm font-medium shadow-lg shadow-purple-900/20"
          >
            {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
            AI Enhance
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-500 uppercase mb-2">Repo Name</label>
              <input 
                type="text" 
                value={repoConfig.name}
                onChange={(e) => setRepoConfig({...repoConfig, name: e.target.value})}
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-zinc-700"
                placeholder="my-awesome-project"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-500 uppercase mb-2">Visibility</label>
              <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                <button 
                  onClick={() => setRepoConfig({...repoConfig, isPrivate: false})}
                  className={clsx("flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2", !repoConfig.isPrivate ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300')}
                >
                  <Globe size={14} /> Public
                </button>
                <button 
                  onClick={() => setRepoConfig({...repoConfig, isPrivate: true})}
                  className={clsx("flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2", repoConfig.isPrivate ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300')}
                >
                  <Lock size={14} /> Private
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase mb-2">Description</label>
            <input 
              type="text" 
              value={repoConfig.description}
              onChange={(e) => setRepoConfig({...repoConfig, description: e.target.value})}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-zinc-700"
              placeholder="A brief description of your project..."
            />
          </div>

          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 overflow-hidden flex flex-col h-96">
             <div className="p-3 bg-zinc-900/80 border-b border-zinc-800 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      id="readme"
                      checked={repoConfig.includeReadme}
                      onChange={(e) => setRepoConfig({...repoConfig, includeReadme: e.target.checked})}
                      className="w-4 h-4 bg-zinc-950 border-zinc-700 rounded focus:ring-cyan-500 text-cyan-600"
                    />
                    <label htmlFor="readme" className="text-zinc-300 text-sm font-medium cursor-pointer select-none">README.md</label>
                 </div>
                 
                 {repoConfig.includeReadme && (
                   <div className="flex bg-zinc-950 rounded-lg p-0.5 border border-zinc-800">
                      <button 
                        onClick={() => setReadmeMode('edit')}
                        className={clsx("p-1.5 rounded transition-all", readmeMode === 'edit' ? 'bg-zinc-800 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300')}
                        title="Edit Markdown"
                      >
                        <Edit size={14} />
                      </button>
                      <button 
                        onClick={() => setReadmeMode('preview')}
                        className={clsx("p-1.5 rounded transition-all", readmeMode === 'preview' ? 'bg-zinc-800 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300')}
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                   </div>
                 )}
             </div>
             
             {repoConfig.includeReadme && (
                <div className="flex-1 overflow-hidden relative">
                  {readmeMode === 'edit' ? (
                    <textarea 
                        value={repoConfig.readmeContent}
                        onChange={(e) => setRepoConfig({...repoConfig, readmeContent: e.target.value})}
                        className="w-full h-full bg-zinc-950 text-zinc-300 p-4 focus:outline-none font-mono text-xs leading-relaxed resize-none custom-scrollbar"
                        placeholder="# Project Title..."
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-950 text-zinc-300 p-4 overflow-y-auto prose prose-invert prose-sm max-w-none custom-scrollbar">
                       <ReactMarkdown>{repoConfig.readmeContent || '*No content*'}</ReactMarkdown>
                    </div>
                  )}
                </div>
             )}
          </div>
        </div>
      </div>

      {/* Right Column: File Preview */}
      <div className="lg:col-span-1 bg-zinc-950 rounded-xl border border-zinc-800 p-4 flex flex-col h-full">
         <h3 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
           <FileText size={14} /> Files ({files.length})
         </h3>
         <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar max-h-[550px]">
            {files.slice(0, 100).map((f, i) => (
              <div key={i} className="text-xs text-zinc-500 font-mono truncate flex items-center gap-2 py-1 px-2 hover:bg-zinc-900 rounded group transition-colors">
                 <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full group-hover:bg-cyan-500 transition-colors"></span>
                 {f.path}
                 <span className="ml-auto text-[10px] text-zinc-700">{(f.size / 1024).toFixed(1)}kb</span>
              </div>
            ))}
            {files.length > 100 && (
              <div className="text-xs text-zinc-600 italic pl-3 py-2">...and {files.length - 100} more</div>
            )}
         </div>
         <div className="mt-4 pt-4 border-t border-zinc-800 text-xs text-zinc-500 flex justify-between items-center">
            <span>Total Size:</span>
            <span className="text-zinc-300 font-mono">{(files.reduce((a, b) => a + b.size, 0) / 1024 / 1024).toFixed(2)} MB</span>
         </div>
      </div>

      <div className="lg:col-span-3 flex justify-between items-center pt-4 border-t border-zinc-800">
        <button 
          onClick={() => setStep(Step.UPLOAD)}
          className="text-zinc-500 hover:text-white transition-colors text-sm font-medium px-4 flex items-center gap-2"
        >
          <ArrowRight size={14} className="rotate-180" /> Back
        </button>
        <button 
          onClick={handleDeploy}
          disabled={!repoConfig.name}
          className="bg-white text-black hover:bg-zinc-200 font-bold px-8 py-3 rounded-lg shadow-lg shadow-white/10 transition-all flex items-center gap-2 active:scale-[0.98]"
        >
          Deploy Repository <ArrowRight size={18} />
        </button>
      </div>
    </motion.div>
  );

  const renderDeploy = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="glass-panel p-1 rounded-2xl max-w-2xl w-full overflow-hidden border-zinc-800"
    >
      <div className="bg-zinc-900/80 p-6 border-b border-zinc-800 flex items-center gap-4">
        {step === Step.SUCCESS ? (
           <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
             <CheckCircle className="text-green-400" size={24} />
           </div>
        ) : (
           <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
             <Loader2 className="animate-spin text-cyan-400" size={24} />
           </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-white">
            {step === Step.SUCCESS ? 'Mission Accomplished' : 'Deploying to GitHub'}
          </h2>
          <p className="text-zinc-400 text-sm">
             {step === Step.SUCCESS ? 'Your repository is live and ready for action.' : 'Synchronizing files and creating git objects...'}
          </p>
        </div>
      </div>

      <div className="bg-black p-6 font-mono text-sm h-80 overflow-y-auto flex flex-col gap-2 relative">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(0,0,0,0.8)_100%)]"></div>
        {logs.map((log, idx) => (
          <div key={idx} className={clsx("flex gap-3 relative z-10", {
            'text-red-400': log.type === 'error',
            'text-green-400': log.type === 'success',
            'text-zinc-400': log.type === 'info',
            'text-yellow-400': log.type === 'warning'
          })}>
            <span className="text-zinc-700 select-none min-w-[80px]">{new Date(log.timestamp).toLocaleTimeString([], {hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"})}</span>
            <span className="break-all">{log.type === 'error' ? '✖' : log.type === 'success' ? '✔' : '>'} {log.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
        {step === Step.DEPLOY && (
           <div className="animate-pulse text-cyan-500 pl-[92px]">_</div>
        )}
      </div>

      {step === Step.SUCCESS && deployUrl && (
        <div className="p-6 bg-zinc-900 border-t border-zinc-800 flex flex-col gap-4">
           <div className="flex items-center gap-4 p-4 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors">
              <Github size={24} className="text-white" />
              <div className="flex-1 overflow-hidden">
                <p className="text-zinc-400 text-xs uppercase tracking-wider font-semibold">Repository URL</p>
                <a href={deployUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 font-medium truncate block">
                  {deployUrl}
                </a>
              </div>
              <a href={deployUrl} target="_blank" rel="noreferrer" className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors border border-zinc-700">
                Open
              </a>
           </div>
           
           <button 
             onClick={() => {
               setStep(Step.UPLOAD);
               setFiles([]);
               setLogs([]);
               setRepoConfig({ name: '', description: '', isPrivate: false, includeReadme: true, readmeContent: '' });
             }}
             className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5 active:scale-[0.98]"
           >
             Deploy Another Project
           </button>
        </div>
      )}

      {step === Step.DEPLOY && error && (
         <div className="p-6 bg-zinc-900 border-t border-zinc-800">
             <button 
                 onClick={() => setStep(Step.CONFIG)}
                 className="w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-200 font-medium py-3 rounded-lg transition-all"
               >
                 Return to Configuration
               </button>
         </div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 selection:bg-cyan-500/30 flex flex-col">
      
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-white p-1.5 rounded-lg">
              <Github size={18} className="text-black" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              GitZip <span className="text-zinc-500 font-light">Deployer</span>
            </h1>
          </div>
          
          {user && (
            <div className="flex items-center gap-3 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
              <img src={user.avatar_url} alt="User" className="w-5 h-5 rounded-full" />
              <span className="text-xs font-medium text-zinc-300">{user.login}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12 flex flex-col items-center justify-start">
        <Steps currentStep={step} />
        
        <div className="w-full flex justify-center mt-8">
          <AnimatePresence mode="wait">
            {step === Step.AUTH && renderAuth()}
            {step === Step.UPLOAD && renderUpload()}
            {step === Step.CONFIG && renderConfig()}
            {(step === Step.DEPLOY || step === Step.SUCCESS) && renderDeploy()}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-zinc-600 text-xs border-t border-zinc-900">
        <p>Powered by Google Gemini 2.0 Flash & GitHub API</p>
      </footer>
    </div>
  );
};

export default App;