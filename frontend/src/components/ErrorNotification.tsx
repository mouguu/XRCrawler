// Wabi Sabi Error Categories - Muted, Natural Tones
const ERROR_CATEGORIES = {
    network: {
        icon: '◉',
        color: 'text-slate-700',
        bgColor: 'bg-slate-50/80',
        borderColor: 'border-slate-300/40',
        accentColor: '#64748b'
    },
    auth: {
        icon: '◐',
        color: 'text-rust',
        bgColor: 'bg-rust/5',
        borderColor: 'border-rust/20',
        accentColor: '#a65e4e'
    },
    rate_limit: {
        icon: '◑',
        color: 'text-clay',
        bgColor: 'bg-clay/10',
        borderColor: 'border-clay/20',
        accentColor: '#8b7e74'
    },
    config: {
        icon: '◒',
        color: 'text-moss',
        bgColor: 'bg-moss/10',
        borderColor: 'border-moss/20',
        accentColor: '#6e7866'
    },
    validation: {
        icon: '◓',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50/60',
        borderColor: 'border-amber-300/30',
        accentColor: '#b45309'
    },
    unknown: {
        icon: '◔',
        color: 'text-stone',
        bgColor: 'bg-stone/5',
        borderColor: 'border-stone/20',
        accentColor: '#7a7a7a'
    }
};

interface ErrorNotificationProps {
    error: any; // AppError type
    onDismiss: () => void;
    onRetry?: () => void;
}

export function ErrorNotification({ error, onDismiss, onRetry }: ErrorNotificationProps) {
    const category = ERROR_CATEGORIES[error.type as keyof typeof ERROR_CATEGORIES] || ERROR_CATEGORIES.unknown;

    return (
        <div 
            className={`
                relative overflow-hidden
                ${category.bgColor} ${category.borderColor}
                border-l-[3px] rounded-organic
                shadow-paper-lg
                backdrop-blur-sm
                animate-ink-spread
                card-paper
            `}
            style={{
                borderLeftColor: category.accentColor
            }}
        >
            {/* Paper texture overlay */}
            <div className="absolute inset-0 opacity-30 pointer-events-none">
                <div className="w-full h-full" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E")`,
                }}></div>
            </div>

            <div className="relative p-4 padding-natural">
                <div className="flex items-start gap-4">
                    {/* Icon - larger, organic feel */}
                    <div 
                        className={`flex-shrink-0 w-10 h-10 ${category.color} flex items-center justify-center rounded-full bg-white/40 shadow-paper`}
                        style={{
                            fontSize: '1.5rem',
                            fontWeight: 300,
                        }}
                    >
                        {category.icon}
                    </div>
                    
                    <div className="flex-1 min-w-0 space-organic-sm">
                        <h4 className={`font-serif text-lg ${category.color} font-semibold mb-2`}>
                            {error.message}
                        </h4>
                        
                        {error.suggestion && (
                            <div className="mt-3 p-3 rounded-organic bg-white/30 border border-white/40">
                                <p className="text-sm text-stone-700 font-sans leading-relaxed">
                                    💡 <span className="font-medium">{error.suggestion}</span>
                                </p>
                            </div>
                        )}
                        
                        {error.details && (
                            <details className="mt-3 text-xs text-stone-500 group">
                                <summary className="cursor-pointer hover:text-stone-700 transition-colors font-sans select-none list-none">
                                    <span className="inline-flex items-center gap-2">
                                        <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                                        <span className="text-[10px] uppercase tracking-wider">Technical Details</span>
                                    </span>
                                </summary>
                                <pre className="mt-2 p-3 bg-charcoal/5 rounded-organic text-[11px] overflow-x-auto font-mono text-charcoal/80 leading-relaxed border border-charcoal/10">
{error.details}
                                </pre>
                            </details>
                        )}
                        
                        <div className="mt-3 text-[10px] text-stone-400 font-mono uppercase tracking-wider">
                            {error.timestamp?.toLocaleTimeString('en-US', { 
                                hour: '2-digit', 
                                minute: '2-digit',
                                second: '2-digit'
                            })}
                        </div>
                    </div>
                    
                    {/* Action buttons - organic styling */}
                    <div className="flex gap-2 flex-shrink-0">
                        {error.canRetry && onRetry && (
                            <button
                                onClick={onRetry}
                                className="px-4 py-2 bg-rust/90 text-washi rounded-full text-xs uppercase tracking-wider font-sans hover:bg-rust transition-all duration-300 shadow-paper hover:shadow-paper-lg btn-organic"
                                style={{
                                    fontWeight: 600,
                                }}
                            >
                                Retry
                            </button>
                        )}
                        <button
                            onClick={onDismiss}
                            className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-700 transition-colors rounded-full hover:bg-white/40"
                            aria-label="Dismiss"
                            title="Dismiss notification"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M4 4l8 8M12 4l-8 8" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom weathered edge effect */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-stone/10 to-transparent"></div>
        </div>
    );
}
