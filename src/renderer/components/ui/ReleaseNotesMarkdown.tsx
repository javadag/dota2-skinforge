import React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components: Components = {
  a: ({ href, children }) => {
    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      if (!href) return

      try {
        const url = new URL(href)
        if ((url.protocol === 'https:' || url.protocol === 'http:') && window.skinforge?.openExternal) {
          void window.skinforge.openExternal(url.toString())
        }
      } catch {
        // Ignore malformed or unsupported links.
      }
    }

    return (
      <a href={href} onClick={handleClick} className="text-purple-300 underline underline-offset-2 hover:text-purple-200 break-all">
        {children}
      </a>
    )
  }
}

export const ReleaseNotesMarkdown: React.FC<{ children: string; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`select-text [&_p]:mb-2 [&_p:last-child]:mb-0 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:font-mono [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/40 [&_pre]:p-2 ${className}`}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  </div>
)
