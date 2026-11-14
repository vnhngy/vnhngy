import math, sys, json
def arc(cx,cy,r,a0,a1):
    p=lambda a:(cx+r*math.cos(math.radians(a)), cy-r*math.sin(math.radians(a)))
    x0,y0=p(a0); x1,y1=p(a1)
    return f"M{x0:.1f} {y0:.1f}A{r} {r} 0 1 0 {x1:.1f} {y1:.1f}"
def mark(pid, dx=7, scale=1.0):
    # „C“ (weiß) mit Pfeilspitze (orange): car + arrow
    t=lambda x,y:(512+(x+dx-512)*scale, 512+(y-512)*scale)
    cx,cy=t(430,512); r=210*scale; cs=110*scale; ss=104*scale
    a,b,c=t(680,400),t(792,512),t(680,624)
    return (f'<path d="{arc(cx,cy,r,50,310)}" fill="none" stroke="#F4F5F6" stroke-width="{cs:.1f}" stroke-linecap="round"/>'
            f'<path d="M{a[0]:.1f} {a[1]:.1f}L{b[0]:.1f} {b[1]:.1f}L{c[0]:.1f} {c[1]:.1f}" fill="none" stroke="url(#{pid}2)" stroke-width="{ss:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
def defs(pid): return (f'<defs><linearGradient id="{pid}1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B2F36"/><stop offset="1" stop-color="#121418"/></linearGradient>'
                       f'<linearGradient id="{pid}2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF7A1A"/><stop offset="1" stop-color="#FFB13B"/></linearGradient></defs>')
def svg(pid="cl", bg=True, scale=1.0, extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"{extra}>{defs(pid)}'
            + (f'<rect width="1024" height="1024" fill="url(#{pid}1)"/>' if bg else "") + mark(pid, scale=scale) + '</svg>')
if __name__ == "__main__":
    out=sys.argv[1]
    open(f"{out}/logo.svg","w").write(svg())
    open(f"{out}/mark-fg.svg","w").write(svg("fg", bg=False, scale=0.72))
    open(f"{out}/mark.svg","w").write(svg("mk", bg=False, scale=1.0))
    open(f"{out}/bg.svg","w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{defs("bg")}<rect width="1024" height="1024" fill="url(#bg1)"/></svg>')
