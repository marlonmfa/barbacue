# Remuneração dos entregadores

A apuração fica em **Despacho de entregas → Remuneração dos entregadores**,
disponível para administradores e gerentes com acesso ao despacho.

- A arrancada é de R$ 110,00 por entregador em cada dia operacional trabalhado.
  As dez primeiras entregas concluídas estão incluídas. A 11ª e as seguintes
  acrescentam R$ 6,00 cada.
- Acima de 5 km, toda a distância viária da loja ao destino acrescenta R$ 1,00
  por quilômetro, arredondado ao centavo por entrega. Aos 5 km exatos não há
  adicional. Uma entrega extra de 5,3 km acrescenta R$ 11,30.
- O fechamento agrupa pela saída e usa a conclusão quando falta o horário de
  saída. O dia operacional vai das 6h às 6h em America/Sao_Paulo.
- Uma entrega concluída comprova que o turno foi trabalhado. Sem entrega, a
  gestão precisa confirmar o turno explicitamente. A confirmação é registrada
  com responsável e horário.
- Entregas canceladas, testes e pedidos sem entregador não entram no cálculo.
  Uma distância pendente deixa o valor parcial. A ação de medir usa a origem
  registrada no roteiro, ou a origem configurada para uma entrega avulsa, e
  grava a distância viária para conferências futuras.
- O relatório não altera o frete do cliente, não lança pagamento no caixa e
  não executa Pix. Serve para conferência da gestão.

A migração aditiva `0041_courier_pay_shifts.sql` está incluída na versão.
O desktop usa a mesma tela de despacho e a mesma API do site.
