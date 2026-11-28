# v2-fix: list where a V2 function is declared (DEF), replaced (SET) and saved for wrapping (CAP: const X=name).
# A DEF/SET followed by another SET with no CAP in between is dead, unless something holds a direct reference
# (e.g. el.onclick=name) or calls it during load. Usage: python3 scripts/audit/override-chain.py render inspector
import re,sys
L=open('legacy/app.zh-Hant.html',encoding='utf8').read().split('\n')
for name in sys.argv[1:]:
    n=re.escape(name); ev=[]
    for i,l in enumerate(L,1):
        if i>5300 and i<10380: continue  # skip the minified shell bundle
        for m in re.finditer(r'function\s+'+n+r'\s*\(',l): ev.append((i,m.start(),'DEF'))
        for m in re.finditer(r'(?<![\w$.])(?:window\.)?'+n+r'\s*=(?!=)\s*(?:async\s*)?(?:function|\()',l): ev.append((i,m.start(),'SET'))
        for m in re.finditer(r'(?:const|let|var)\s+([\w$]+)\s*=\s*(?:window\.)?'+n+r'\s*[;,]',l): ev.append((i,m.start(),'CAP:'+m.group(1)))
    ev.sort(); print(name,' '.join(f"{i}{':'+str(c) if c else ''}={t}" for i,c,t in ev))
