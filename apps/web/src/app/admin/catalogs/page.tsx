"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcons";
import styles from "./catalogs.module.css";

type Brand = "barbacue" | "barbadog" | "chelas";
interface Product { id:number; brand:Brand; name:string; description:string|null; category:string; priceCents:number; imageUrl:string|null; available:boolean; source:string }

const BRANDS: Record<Brand,{name:string;monogram:string;color:string}> = {
  barbacue:{name:"Barbacue",monogram:"B",color:"#e4413f"},
  barbadog:{name:"Barbadog",monogram:"BD",color:"#e4ad37"},
  chelas:{name:"Chelas",monogram:"CH",color:"#3b9e75"},
};
const EMPTY = { brand:"barbacue" as Brand,name:"",description:"",category:"",priceReais:"",imageUrl:"",available:true };
const PAGE_SIZE = 25;

function brl(cents:number){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100)}
function cents(value:string){return Math.round((Number(value.replace(/\./g,"").replace(",",".").replace(/[^0-9.]/g,""))||0)*100)}

export default function CatalogsPage(){
  const [products,setProducts]=useState<Product[]>([]);
  const [loading,setLoading]=useState(true);
  const [brand,setBrand]=useState<Brand>("barbacue");
  const [search,setSearch]=useState("");
  const [pageIndex,setPageIndex]=useState(0);
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState<Product|null>(null);
  const [form,setForm]=useState(EMPTY);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  async function load(){const response=await fetch("/api/admin/catalogs",{cache:"no-store"});if(response.ok)setProducts(await response.json());else setError("Não foi possível carregar os catálogos.");setLoading(false)}
  useEffect(()=>{let cancelled=false;fetch("/api/admin/catalogs",{cache:"no-store"}).then(async response=>{if(cancelled)return;if(response.ok)setProducts(await response.json());else setError("Não foi possível carregar os catálogos.");setLoading(false)});return()=>{cancelled=true}},[]);

  const visible=useMemo(()=>products.filter(product=>product.brand===brand&&`${product.name} ${product.category}`.toLowerCase().includes(search.toLowerCase())),[products,brand,search]);
  const pageCount=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));
  const pageRows=visible.slice(pageIndex*PAGE_SIZE,(pageIndex+1)*PAGE_SIZE);
  const counts=(id:Brand)=>{const rows=products.filter(product=>product.brand===id);return{total:rows.length,available:rows.filter(product=>product.available).length}};

  function openCreate(){setEditing(null);setForm({...EMPTY,brand});setError("");setShowForm(true)}
  function openEdit(product:Product){setEditing(product);setForm({brand:product.brand,name:product.name,description:product.description??"",category:product.category,priceReais:(product.priceCents/100).toFixed(2).replace(".",","),imageUrl:product.imageUrl??"",available:product.available});setError("");setShowForm(true)}
  async function toggle(product:Product){setProducts(current=>current.map(row=>row.id===product.id&&row.brand===product.brand?{...row,available:!row.available}:row));const response=await fetch(`/api/admin/catalogs/${product.brand}/${product.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({available:!product.available})});if(!response.ok)await load()}
  async function save(event:React.FormEvent){event.preventDefault();setSaving(true);setError("");const url=editing?`/api/admin/catalogs/${editing.brand}/${editing.id}`:"/api/admin/catalogs";const payload={...form,priceCents:cents(form.priceReais),description:form.description||null,imageUrl:form.imageUrl||null};const response=await fetch(url,{method:editing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}).catch(()=>null);setSaving(false);if(!response?.ok){setError("Confira os campos e tente novamente.");return}setShowForm(false);await load()}
  async function remove(product:Product){if(!confirm(`Remover ${product.name} do catálogo?`))return;const response=await fetch(`/api/admin/catalogs/${product.brand}/${product.id}`,{method:"DELETE"});if(response.ok)setProducts(current=>current.filter(row=>row.id!==product.id||row.brand!==product.brand))}

  return <div className={styles.page}>
    <header className={styles.head}><div><span className={styles.eyebrow}>Controle multimarcas</span><h1>Catálogos</h1><p>Disponibilidade, preços e produtos das três operações na mesma tela.</p></div><button className={styles.primary} onClick={openCreate}><AdminIcon name="plus" size={17}/>Novo produto</button></header>
    <section className={styles.brandRail}>{(Object.keys(BRANDS) as Brand[]).map(id=>{const meta=BRANDS[id],count=counts(id);return <button key={id} className={`${styles.brandCard} ${brand===id?styles.brandActive:""}`} style={{"--brand":meta.color} as React.CSSProperties} onClick={()=>{setBrand(id);setPageIndex(0)}}><span className={styles.monogram}>{meta.monogram}</span><span className={styles.brandCopy}><strong>{meta.name}</strong><span>{count.available} disponíveis agora</span></span><span className={styles.brandCount}><strong>{count.total}</strong><span>itens</span></span></button>})}</section>
    <div className={styles.toolbar}><label className={styles.search}><AdminIcon name="products" size={16}/><input type="search" value={search} onChange={event=>{setSearch(event.target.value);setPageIndex(0)}} placeholder={`Buscar no ${BRANDS[brand].name}…`}/></label><span className={styles.summary}>{visible.length} {visible.length===1?"produto":"produtos"} neste filtro</span></div>
    <section className={styles.panel}>{loading?<div className={styles.empty}>Carregando catálogos…</div>:<><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Origem</th><th>Disponibilidade</th><th>Ações</th></tr></thead><tbody>{pageRows.map(product=>{const meta=BRANDS[product.brand];return <tr key={`${product.brand}:${product.id}`}><td><div className={styles.product}><span className={styles.thumb} style={{"--brand":meta.color} as React.CSSProperties}>{meta.monogram}</span><span><strong>{product.name}</strong><span>{product.description||"Sem descrição"}</span></span></div></td><td><span className={styles.category}>{product.category}</span></td><td><span className={styles.price}>{brl(product.priceCents)}</span></td><td><span className={styles.source}>{product.source==="ifood"?"iFood sincronizado":product.source==="native"?"Sistema":"Adicionado"}</span></td><td><button className={`${styles.toggle} ${product.available?"":styles.off}`} onClick={()=>toggle(product)}>{product.available?"Disponível":"Indisponível"}</button></td><td><div className={styles.actions}><button className={styles.action} onClick={()=>openEdit(product)}>Editar</button><button className={`${styles.action} ${styles.delete}`} onClick={()=>remove(product)}>Remover</button></div></td></tr>})}</tbody></table></div>{visible.length===0?<div className={styles.empty}>Nenhum produto encontrado neste catálogo.</div>:<div className={styles.pager}><span>Mostrando {pageIndex*PAGE_SIZE+1}–{Math.min((pageIndex+1)*PAGE_SIZE,visible.length)} de {visible.length}</span><div className={styles.pagerActions}><button className={styles.pagerButton} disabled={pageIndex===0} onClick={()=>setPageIndex(current=>Math.max(0,current-1))}>Anterior</button><span>{pageIndex+1} / {pageCount}</span><button className={styles.pagerButton} disabled={pageIndex>=pageCount-1} onClick={()=>setPageIndex(current=>Math.min(pageCount-1,current+1))}>Próxima</button></div></div>}</>}</section>
    {error&&!showForm&&<p className={styles.error}>{error}</p>}
    {showForm&&<div className={styles.backdrop} onMouseDown={event=>event.target===event.currentTarget&&setShowForm(false)}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="catalog-title"><header className={styles.modalHead}><h2 id="catalog-title">{editing?"Editar produto":"Novo produto"}</h2><button className={styles.close} onClick={()=>setShowForm(false)} aria-label="Fechar"><AdminIcon name="close" size={17}/></button></header><form className={styles.form} onSubmit={save}><div className={styles.formGrid}>
      <Field label="Restaurante"><select disabled={!!editing} className={styles.input} value={form.brand} onChange={event=>setForm({...form,brand:event.target.value as Brand})}>{(Object.keys(BRANDS) as Brand[]).map(id=><option key={id} value={id}>{BRANDS[id].name}</option>)}</select></Field>
      <Field label="Categoria *"><input required className={styles.input} value={form.category} onChange={event=>setForm({...form,category:event.target.value})}/></Field>
      <div className={`${styles.field} ${styles.full}`}><label>Nome *</label><input required className={styles.input} value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></div>
      <div className={`${styles.field} ${styles.full}`}><label>Descrição</label><textarea className={styles.textarea} value={form.description} onChange={event=>setForm({...form,description:event.target.value})}/></div>
      <Field label="Preço *"><input required inputMode="decimal" className={styles.input} placeholder="29,90" value={form.priceReais} onChange={event=>setForm({...form,priceReais:event.target.value})}/></Field>
      <Field label="Imagem (URL)"><input className={styles.input} value={form.imageUrl} onChange={event=>setForm({...form,imageUrl:event.target.value})}/></Field>
      <label className={styles.check}><input type="checkbox" checked={form.available} onChange={event=>setForm({...form,available:event.target.checked})}/>Produto disponível para venda</label>
    </div>{error&&<p className={styles.error}>{error}</p>}<div className={styles.modalActions}><button type="button" className={styles.cancel} onClick={()=>setShowForm(false)}>Cancelar</button><button className={styles.save} disabled={saving}>{saving?"Salvando…":"Salvar produto"}</button></div></form></section></div>}
  </div>
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <div className={styles.field}><label>{label}</label>{children}</div>}
