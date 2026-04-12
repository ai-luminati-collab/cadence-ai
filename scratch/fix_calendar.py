
path = '/Users/yashranka/Agentic/SMM/src/app/(dashboard)/calendar/page.tsx'
with open(path, 'r') as f:
    lines = f.readlines()

# Add header button
found = False
for i, line in enumerate(lines):
    if '<div className="flex gap-3 h-max">' in line:
        button_code = """           {calendar && calendar.length > 0 && (
              <button 
                onClick={handleBatchGenerate}
                disabled={isBatchGenerating}
                className="h-12 px-6 flex items-center gap-2 rounded-full bg-[var(--color-accent-600)]/10 border border-[var(--color-accent-500)]/40 hover:bg-[var(--color-accent-600)]/20 text-xs font-black uppercase tracking-widest text-[var(--color-accent-400)] transition-all disabled:opacity-50"
              >
                {isBatchGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {isBatchGenerating ? `Drafting...` : 'Draft All Pending'}
              </button>
           )}\n"""
        lines.insert(i + 1, button_code)
        found = True
        break

if not found:
    print("Header div not found!")

with open(path, 'w') as f:
    f.writelines(lines)
