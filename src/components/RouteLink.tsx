import { go } from '../lib/router'

// A real link to a screen of the app: it has an address (so it can be
// opened in a new tab or copied), and a plain click changes screen without
// reloading the page.
export default function RouteLink({ to, onClick, ...rest }: { to: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <a
      href={to}
      onClick={e => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        go(to)
      }}
      {...rest}
    />
  )
}
