import { inflateSync } from 'node:zlib';
/** Minimal PNG decoder: 8-bit RGB/RGBA, no interlace. Enough to read a screenshot pixel. */
export function decodePng(buf) {
  let off = 8, w=0, h=0, depth=0, ctype=0; const idat=[];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off+4, off+8);
    const data = buf.subarray(off+8, off+8+len);
    if (type === 'IHDR') { w=data.readUInt32BE(0); h=data.readUInt32BE(4); depth=data[8]; ctype=data[9];
      if (depth!==8 || (ctype!==2 && ctype!==6)) throw new Error(`unsupported png depth=${depth} ctype=${ctype}`); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bpp = ctype === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  const pa=(i,r)=> i>=bpp ? out[r*stride+i-bpp] : 0;
  const pb=(i,r)=> r>0 ? out[(r-1)*stride+i] : 0;
  const pc=(i,r)=> (r>0 && i>=bpp) ? out[(r-1)*stride+i-bpp] : 0;
  for (let r=0;r<h;r++) {
    const f = raw[r*(stride+1)];
    for (let i=0;i<stride;i++) {
      const x = raw[r*(stride+1)+1+i]; let v;
      if (f===0) v=x; else if (f===1) v=x+pa(i,r); else if (f===2) v=x+pb(i,r);
      else if (f===3) v=x+((pa(i,r)+pb(i,r))>>1);
      else { const a=pa(i,r),b=pb(i,r),c=pc(i,r), p=a+b-c, da=Math.abs(p-a), db=Math.abs(p-b), dc=Math.abs(p-c);
             v = x + (da<=db && da<=dc ? a : db<=dc ? b : c); }
      out[r*stride+i] = v & 0xff;
    }
  }
  return { w, h, bpp, px: (x,y) => [out[y*stride+x*bpp], out[y*stride+x*bpp+1], out[y*stride+x*bpp+2]] };
}
export const lum = ([r,g,b]) => { const c=[r,g,b].map(v=>{const s=v/255; return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4);}); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
export const contrast=(a,b)=>{const[hi,lo]=[lum(a),lum(b)].sort((x,y)=>y-x); return (hi+0.05)/(lo+0.05);};
