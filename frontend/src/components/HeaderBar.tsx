interface HeaderBarProps {
  apiKey: string;
  apiKeyInput: string;
  onApiKeyInputChange: (value: string) => void;
  onApply: () => void;
}

export function HeaderBar({
  apiKey,
  apiKeyInput,
  onApiKeyInputChange,
  onApply,
}: HeaderBarProps) {
  return (
    <header className="py-8 px-6 md:px-20 border-b border-stone/15 relative">
      {/* Subtle organic divider */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-[1px] opacity-40"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #7a7a7a 10%, #7a7a7a 90%, transparent 100%)',
          maskImage: `url("data:image/svg+xml,%3Csvg width='400' height='2' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,1 Q100,0.5 200,1 T400,1' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E")`,
          maskSize: '100% 100%',
          maskRepeat: 'no-repeat'
        }}
      ></div>

      <div className="max-w-5xl mx-auto flex justify-between items-center">
        <div className="space-organic-sm">
          <h1 className="text-3xl md:text-4xl mb-3 font-display text-charcoal tracking-tight">
            XRCrawler
          </h1>
          <div className="flex items-center gap-3">
            <div className="h-[1px] w-8 bg-rust/60"></div>
            <p className="text-stone text-xs uppercase tracking-[0.2em] font-sans font-medium">
              Twitter/X & Reddit Scraper
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="relative flex items-center gap-3">
            {/* API Key Input - Organic styling */}
            <div className="relative group">
              <label className="absolute left-0 -top-5 text-[9px] uppercase tracking-[0.25em] text-stone/50 font-sans pointer-events-none">
                API Key
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => onApiKeyInputChange(e.target.value)}
                placeholder="Enter key..."
                className="
                  bg-transparent border-b border-stone/40 py-2 px-1
                  focus:outline-none focus-ink
                  transition-all duration-300
                  text-sm font-mono text-charcoal placeholder-stone/30 
                  w-48
                  focus:border-rust/60
                "
                style={{
                  borderBottomStyle: 'solid',
                  borderImageSlice: 1,
                }}
              />
              {/* Organic underline on focus */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rust/60 origin-center scale-x-0 transition-transform duration-300 group-focus-within:scale-x-100 rounded-full"></div>
            </div>
            
            {/* Apply Button - Organic rounded */}
            <button
              onClick={onApply}
              className="
                px-4 py-2 border border-charcoal/60 rounded-full
                text-[10px] uppercase tracking-[0.2em] font-sans font-semibold
                hover:bg-charcoal hover:text-washi 
                transition-all duration-400
                btn-organic shadow-paper
                hover:shadow-paper-lg
              "
            >
              Apply
            </button>
            
            {/* Applied Indicator */}
            {apiKey && (
              <div className="flex items-center gap-2 animate-ink-spread">
                <div className="w-2 h-2 rounded-full bg-moss shadow-paper"></div>
                <span className="text-[9px] uppercase tracking-[0.25em] text-moss/80 font-sans font-medium">
                  Applied
                </span>
              </div>
            )}
          </div>
          
          {/* Logs Link - Natural hover */}
          <a
            href="#results"
            className="
              text-xs uppercase tracking-[0.15em] 
              text-charcoal/70 hover:text-rust 
              transition-all duration-300 
              font-sans font-semibold
              hover-warm
              border-b border-transparent hover:border-rust/30
              pb-1
            "
          >
            View Logs
          </a>
        </div>
      </div>
    </header>
  );
}
