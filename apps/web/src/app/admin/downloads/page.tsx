import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/admin-auth';
import { landingPath } from '@/lib/permissions';
import { desktopDownloadInfo } from '@/lib/desktop-download';
import { AdminIcon } from '@/components/admin/AdminIcons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Programa Windows | Administração', robots: { index: false, follow: false } };

export default async function AdminDownloads() {
  const session = await requireStaff();
  if (session.role !== 'admin') redirect(landingPath(session));
  const installer = await desktopDownloadInfo();
  return <div className="max-w-2xl">
    <h1 className="text-2xl font-bold text-white">Programa para Windows</h1>
    <p className="mt-2 mb-6 text-sm leading-relaxed text-[#c8b89a]">Instale o Barbacue Pedidos no computador da loja para gerenciar os pedidos e imprimir comandas. O acesso pelo navegador continua disponível.</p>
    <section className="rounded-2xl border border-[#352b24] bg-[#1a1512] p-6" aria-label="Download do programa">
      <div className="flex items-center gap-3"><AdminIcon name="printer" size={25} /><h2 className="text-lg font-semibold text-white">Barbacue Pedidos</h2></div>
      <p className="mt-3 text-sm text-[#c8b89a]">Windows 10 e 11 · 64 bits · Impressão em 58 mm, 80 mm ou A4</p>
      {installer ? <>
        <p className="mt-2 text-sm text-[#a89a8c]">Versão {installer.version} · {(installer.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</p>
        <a href="/api/admin/downloads/windows" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#ed1b24] px-5 py-3 text-sm font-semibold text-white hover:bg-[#c8141c]" download>Baixar programa para Windows</a>
      </> : <p role="status" className="mt-5 rounded-xl border border-[#594333] p-4 text-sm text-[#c8b89a]">O instalador ainda não foi disponibilizado neste servidor. Aguarde a publicação do arquivo pelo responsável pelo sistema.</p>}
      <p className="mt-4 text-xs leading-relaxed text-[#a89a8c]">Download exclusivo para administradores autenticados. Compartilhar o endereço não libera acesso ao arquivo.</p>
    </section>
    <section className="mt-6 text-sm text-[#c8b89a]">
      <h2 className="mb-3 text-lg font-semibold text-white">Depois de baixar</h2>
      <ol className="list-decimal space-y-3 pl-5 leading-relaxed">
        <li>Abra o instalador e conclua o assistente.</li>
        <li>Informe o endereço da loja e entre com seu acesso habitual.</li>
        <li>Selecione a impressora, informe a chave de impressão fornecida pelo responsável pelo sistema e faça uma impressão de teste.</li>
      </ol>
      <p className="mt-4 text-xs leading-relaxed text-[#a89a8c]">O instalador não tem assinatura digital de editor. A impressão automática requer o servidor atualizado e o computador conectado à internet.</p>
    </section>
  </div>;
}
