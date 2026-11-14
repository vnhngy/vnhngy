import math, sys, json
def arc(cx,cy,r,a0,a1):
    p=lambda a:(cx+r*math.cos(math.radians(a)), cy-r*math.sin(math.radians(a)))
    x0,y0=p(a0); x1,y1=p(a1)
    return f"M{x0:.1f} {y0:.1f}A{r} {r} 0 1 0 {x1:.1f} {y1:.1f}"
def sparkle(cx, cy, R, r):
    """Vierzackiger Glanz-Stern („mint condition“)."""
    pts = []
    for i in range(4):
        a = math.radians(90 * i - 90); b = math.radians(90 * i - 45)
        pts += [(cx + R * math.cos(a), cy + R * math.sin(a)), (cx + r * math.cos(b), cy + r * math.sin(b))]
    d = f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"
    for i in range(4):
        c, e = pts[2 * i + 1], pts[(2 * i + 2) % 8]
        d += f"Q{c[0]:.1f} {c[1]:.1f} {e[0]:.1f} {e[1]:.1f}"
    return d + "Z"
def mark(pid, dx=0, scale=1.0):
    # Carmint: weißes „C“ mit mintgrünem Glanz-Stern
    t = lambda x, y: (512 + (x + dx - 512) * scale, 512 + (y - 512) * scale)
    cx, cy = t(452, 512); r = 220 * scale; cs = 112 * scale
    sx, sy = t(700, 512)
    return (f'<path d="{arc(cx,cy,r,48,312)}" fill="none" stroke="#F4F5F6" stroke-width="{cs:.1f}" stroke-linecap="round"/>'
            f'<path d="{sparkle(sx, sy, 128 * scale, 30 * scale)}" fill="url(#{pid}2)"/>')
def defs(pid): return (f'<defs><linearGradient id="{pid}1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B2F36"/><stop offset="1" stop-color="#121418"/></linearGradient>'
                       f'<linearGradient id="{pid}2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3EE6A8"/><stop offset="1" stop-color="#16B67E"/></linearGradient></defs>')
def svg(pid="cl", bg=True, scale=1.0, extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"{extra}>{defs(pid)}'
            + (f'<rect width="1024" height="1024" fill="url(#{pid}1)"/>' if bg else "") + mark(pid, scale=scale) + '</svg>')
if __name__ == "__main__":
    out=sys.argv[1]
    open(f"{out}/logo.svg","w").write(svg())
    open(f"{out}/mark-fg.svg","w").write(svg("fg", bg=False, scale=0.72))
    open(f"{out}/mark.svg","w").write(svg("mk", bg=False, scale=1.0))
    open(f"{out}/bg.svg","w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{defs("bg")}<rect width="1024" height="1024" fill="url(#bg1)"/></svg>')
