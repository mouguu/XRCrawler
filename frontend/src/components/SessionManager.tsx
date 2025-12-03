import { useState, useEffect, useRef } from 'react';
import { Upload, CheckCircle, XCircle, RefreshCw, FileJson, User, Cookie } from 'lucide-react';

interface SessionInfo {
    filename: string;
    username: string | null;
    isValid: boolean;
    error?: string;
    cookieCount: number;
}

const FRIENDLY_ACCOUNT_NAMES: Record<string, string> = {
    'account1.json': 'Sistine Fibel',
    'account2.json': 'pretextyourmama',
    'account3.json': 'Shirone',
    'account4.json': 'Jeanne Howard',
    account1: 'Sistine Fibel',
    account2: 'pretextyourmama',
    account3: 'Shirone',
    account4: 'Jeanne Howard',
};

export function SessionManager() {
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/sessions');
            const data = await response.json();
            if (data.success) {
                setSessions(data.sessions);
                setError(null);
            } else {
                setError(data.error || 'Failed to fetch sessions');
            }
        } catch (err) {
            setError('Network error while fetching sessions');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/cookies', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();

            if (data.success) {
                await fetchSessions(); // Refresh list
                setError(null);
            } else {
                setError(data.error || 'Upload failed');
            }
        } catch (err) {
            setError('Network error during upload');
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-6 pb-20">
            <div className="card-paper rounded-organic-lg p-8 relative overflow-hidden">
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-rust/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div className="space-organic-sm">
                        <h3 className="text-2xl font-display text-charcoal tracking-tight flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-stone/10 flex items-center justify-center text-stone">
                                <User size={16} />
                            </span>
                            Session Management
                        </h3>
                        <p className="text-sm text-stone/60 font-serif italic pl-11">
                            Manage your Twitter accounts and cookies
                        </p>
                    </div>
                    <div className="flex gap-4 items-center self-end md:self-auto">
                        <button 
                            onClick={fetchSessions} 
                            className="p-3 text-stone/60 hover:text-rust transition-colors rounded-full hover:bg-stone/5"
                            title="Refresh sessions"
                        >
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <div className="relative">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept=".json"
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="
                                    flex items-center gap-3 px-6 py-3 
                                    border border-charcoal/80 rounded-full 
                                    hover:bg-charcoal hover:text-washi 
                                    transition-all duration-300 
                                    text-xs uppercase tracking-[0.15em] font-bold 
                                    disabled:opacity-50 btn-organic shadow-sm
                                "
                            >
                                {uploading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4" />
                                )}
                                Upload Cookies
                            </button>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mb-8 p-4 bg-red-50/50 border border-red-100 rounded-organic text-red-800 text-sm flex items-center gap-3 animate-fade-in-organic">
                        <XCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="font-serif italic">{error}</span>
                    </div>
                )}

                <div className="grid gap-4">
                    {sessions.length === 0 && !loading ? (
                        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-stone/20 rounded-organic bg-stone/5 opacity-60">
                            <FileJson className="w-12 h-12 mb-4 text-stone/30" strokeWidth={1.5} />
                            <p className="font-serif italic text-stone/60 text-sm">No sessions found. Upload a cookie JSON file to get started.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {sessions.map((session) => (
                                <div 
                                    key={session.filename}
                                    className={`
                                        relative group p-5 rounded-organic border transition-all duration-500
                                        ${session.isValid 
                                            ? 'bg-white/60 border-stone/10 hover:border-moss/30 hover:shadow-paper' 
                                            : 'bg-red-50/30 border-red-100 hover:border-red-200'}
                                    `}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            <div className={`
                                                mt-1 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors
                                                ${session.isValid ? 'bg-moss/10 text-moss' : 'bg-red-100 text-red-600'}
                                            `}>
                                                {session.isValid ? <CheckCircle size={16} /> : <XCircle size={16} />}
                                            </div>
                                            <div>
                                                <h4 className="font-display text-lg text-charcoal group-hover:text-rust transition-colors">
                                                    {FRIENDLY_ACCOUNT_NAMES[session.filename] 
                                                        || FRIENDLY_ACCOUNT_NAMES[session.filename.replace(/\.json$/i, '')] 
                                                        || (session.username ? `@${session.username}` : 'Unknown User')}
                                                </h4>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-stone/60 mt-2 font-sans uppercase tracking-wider">
                                                    <span className="font-mono bg-stone/5 px-1.5 py-0.5 rounded text-stone/80">{session.filename}</span>
                                                    <span className="flex items-center gap-1">
                                                        <Cookie size={10} />
                                                        {session.cookieCount}
                                                    </span>
                                                </div>
                                                {!session.isValid && (
                                                    <p className="text-xs text-red-600/80 mt-2 font-serif italic border-l-2 border-red-200 pl-2">
                                                        {session.error}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Corner accent */}
                                    <div className={`absolute top-0 right-0 w-8 h-8 overflow-hidden pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500`}>
                                        <div className={`absolute top-0 right-0 w-12 h-12 -translate-y-1/2 translate-x-1/2 rotate-45 ${session.isValid ? 'bg-moss/20' : 'bg-red-500/20'}`}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
