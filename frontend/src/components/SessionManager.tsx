import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, CheckCircle, XCircle, RefreshCw, FileJson, User, Cookie } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
        } catch {
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
                await fetchSessions();
                setError(null);
            } else {
                setError(data.error || 'Upload failed');
            }
        } catch {
            setError('Network error during upload');
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <section id="sessions" className="py-12">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                            <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                        Sessions
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1 ml-13">
                        Manage your Twitter accounts and cookies
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={fetchSessions}
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".json"
                        className="hidden"
                    />
                    <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="gap-2"
                    >
                        {uploading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Upload className="w-4 h-4" />
                        )}
                        Upload Cookies
                    </Button>
                </div>
            </div>

            {/* Error */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-800 text-sm flex items-center gap-3"
                    >
                        <XCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{error}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sessions Grid */}
            {sessions.length === 0 && !loading ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-dashed border-border rounded-2xl p-12 text-center"
                >
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
                        <FileJson className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">No sessions found</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                        Upload a cookie JSON file to add Twitter accounts for scraping.
                    </p>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence mode="popLayout">
                        {sessions.map((session, index) => (
                            <motion.div
                                key={session.filename}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: index * 0.05 }}
                                className={`
                                    relative p-5 rounded-2xl border transition-all duration-300 group
                                    ${session.isValid 
                                        ? 'bg-card border-border/50 hover:border-border hover:shadow-md' 
                                        : 'bg-red-50/50 border-red-100 hover:border-red-200'}
                                `}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`
                                        w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors
                                        ${session.isValid ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}
                                    `}>
                                        {session.isValid ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium truncate group-hover:text-foreground transition-colors">
                                            {FRIENDLY_ACCOUNT_NAMES[session.filename] 
                                                || FRIENDLY_ACCOUNT_NAMES[session.filename.replace(/\.json$/i, '')] 
                                                || (session.username ? `@${session.username}` : 'Unknown User')}
                                        </h4>
                                        
                                        <div className="flex items-center gap-2 mt-2">
                                            <Badge variant="secondary" className="font-mono text-2xs">
                                                {session.filename}
                                            </Badge>
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Cookie className="w-3 h-3" />
                                                {session.cookieCount}
                                            </span>
                                        </div>
                                        
                                        {!session.isValid && session.error && (
                                            <p className="text-xs text-red-600 mt-3 line-clamp-2">
                                                {session.error}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </section>
    );
}
