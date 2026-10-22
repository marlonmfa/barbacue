CREATE TABLE "erp_attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "erp_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" integer NOT NULL,
	"action" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erp_audit_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "erp_finance" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_date" date NOT NULL,
	"competence" text,
	"document" text,
	"source_key" text,
	"status" text DEFAULT 'open' NOT NULL,
	"settled_date" date,
	"payment_method" text,
	"receipt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erp_finance_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "erp_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"stock_milli" integer DEFAULT 0 NOT NULL,
	"minimum_milli" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_leaves" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"kind" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"notes" text,
	"status" text DEFAULT 'planned' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" integer NOT NULL,
	"quantity_milli" integer NOT NULL,
	"reason" text NOT NULL,
	"reference" text,
	"actor_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_payroll" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"competence" text NOT NULL,
	"base_cents" integer NOT NULL,
	"additions_cents" integer NOT NULL,
	"deductions_cents" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"notes" text,
	"finance_id" integer NOT NULL,
	CONSTRAINT "erp_payroll_employee_month" UNIQUE("employee_id","competence")
);
--> statement-breakpoint
CREATE TABLE "erp_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"brand" text NOT NULL,
	"lines" jsonb NOT NULL,
	"total_cents" integer NOT NULL,
	"due_date" date NOT NULL,
	"invoice" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalog_key" text,
	"brand" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"sale_price_cents" integer DEFAULT 0 NOT NULL,
	"yield_portions" integer DEFAULT 1 NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'review' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erp_recipes_catalog_key_unique" UNIQUE("catalog_key")
);
--> statement-breakpoint
CREATE TABLE "erp_suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"document" text,
	"contact" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_attendance" ADD CONSTRAINT "erp_attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erp_leaves" ADD CONSTRAINT "erp_leaves_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erp_movements" ADD CONSTRAINT "erp_movements_ingredient_id_erp_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."erp_ingredients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erp_payroll" ADD CONSTRAINT "erp_payroll_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erp_payroll" ADD CONSTRAINT "erp_payroll_finance_id_erp_finance_id_fk" FOREIGN KEY ("finance_id") REFERENCES "public"."erp_finance"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "erp_purchases" ADD CONSTRAINT "erp_purchases_supplier_id_erp_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."erp_suppliers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE erp_ingredients ADD CONSTRAINT erp_stock_nonnegative CHECK (stock_milli >= 0 AND minimum_milli >= 0 AND unit_cost_cents >= 0);
--> statement-breakpoint
ALTER TABLE erp_finance ADD CONSTRAINT erp_amount_positive CHECK (amount_cents > 0);
--> statement-breakpoint
INSERT INTO erp_recipes (catalog_key, brand, name, description, category, sale_price_cents)
SELECT 'barbacue:' || p.id, 'barbacue', p.name, coalesce(p.description, ''), coalesce(c.name, ''), p.price_cents FROM products p LEFT JOIN categories c ON c.id = p.category_id ON CONFLICT (catalog_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO erp_recipes (catalog_key, brand, name, description, category, sale_price_cents)
SELECT brand || ':' || external_id, brand, name, coalesce(description, ''), category, price_cents FROM brand_catalog_products ON CONFLICT (catalog_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO erp_recipes (catalog_key, brand, name, description, category, sale_price_cents) VALUES
('barbadog:dda4623f-ab5e-495c-aff8-f4103b57b847', 'barbadog', 'Doguinho', 'Pão brioche 12 cm, 1 salsicha, molho de tomate da casa, ketchup e mostarda', 'Hotdog Tradicional', 2300),
('barbadog:0ec844a6-4e14-42a9-954f-9a92e4fd1836', 'barbadog', 'Barbadog Bacon', 'Pão Hot Dog 25cm, 2 salsichas, maionese verde, creme de queijo, molho de tomate da casa, farofa crocante com batata palha e bacon crocante.', 'Hotdog Tradicional', 4900),
('barbadog:b9361cd5-b766-4b6a-9687-daf93938bced', 'barbadog', 'Barbadog Clássico', 'Pão Hot Dog 25cm, 2 salsichas, maionese verde, creme de queijo, molho de tomate da casa, farofa crocante com batata palha e milho verde.', 'Hotdog Tradicional', 4200),
('barbadog:c842766a-fae0-4656-bea6-69ae65a0827a', 'barbadog', 'Barbadog Crispy', 'Pão Hot Dog 25cm, 2 salsichas, maionese verde, creme de queijo, molho de tomate da casa e cebola crispy.', 'Hotdog Tradicional', 4500),
('barbadog:080472a5-06a3-4828-a244-eac9f8747eef', 'barbadog', 'Barbadog Chilli Nachos', 'Pão Hot Dog 25cm, 2 salsichas, maionese verde, creme de queijo, chilli artesanal e nachos crocantes.', 'Barbadog Especial', 5300),
('barbadog:7c17ef2a-9a42-4cbc-9e64-0040d7ffdd29', 'barbadog', 'Barbadog Corn Bacon Caramelizado', 'Pão Hot Dog 25cm, 2 salsichas, maionese verde, creme de queijo, molho de tomate da casa, milho verde e bacon caramelizado.', 'Barbadog Especial', 5300),
('barbadog:ae29cb1f-3dbd-423d-8316-00c1ba48a71f', 'barbadog', 'Barbadog Coração Catupiry', 'Pão Hot Dog 25cm, 2 salsichas, maionese verde, molho de tomate da casa, coraçãozinho grelhado e Catupiry cremoso.', 'Barbadog Especial', 5900),
('barbadog:83b9aacd-ae3b-4a78-a940-6ae0f38efd4e', 'barbadog', 'Barbadog Calabresa Biquinho', 'Pão Hot Dog 25cm, 2 salsichas, maionese verde, molho de tomate da casa, calabresa moida, pimenta biquinho e Catupiry cremoso.', 'Barbadog Especial', 5300),
('barbadog:72dc6721-ea91-4034-978a-b540ab37e967', 'barbadog', 'Barbadog Frango com Catupiry', 'Pão Hot Dog 25cm, 2 salsichas, maionese verde, molho de tomate da casa, creme de queijo frango desfiado com Catupiry cremoso.', 'Barbadog Especial', 5900),
('barbadog:523c8d15-81e0-4a9d-8af8-282c5cabe1c7', 'barbadog', 'Ciabatta Pulled Pork Chipotle', 'Ciabatta, pulled pork com barbecue, molho chipotle e rúcula.', 'Sandwich', 5600),
('barbadog:decfabe1-e05a-4767-a264-9aa603d86d87', 'barbadog', 'Ciabatta Parmegiana', 'Ciabatta, maionese verde, frango à parmegiana, muzzarela e molho de tomate da casa.', 'Sandwich', 5600),
('barbadog:b9860791-be36-41a4-aad1-f11c2e613465', 'barbadog', 'Ciabatta Veggie Brie E Geleia De Tomate', 'Ciabatta, alface americana, rúcula, maionese verde, queijo brie e geleia de tomate.', 'Sandwich', 5300),
('barbadog:8de7c6fb-07b6-4a17-a15a-059c27d4c808', 'barbadog', 'Croissant Double Smash', 'Croissant folhado amanteigado com 2 smashes de 90g cada, queijo cheddar, bacon crocante e ketchup.', 'Sandwich', 5200),
('barbadog:be0e3c82-c1a3-4fc4-b04d-b2caf71ea6f9', 'barbadog', 'Ciabatta Carne De Panela Catupiry', 'Ciabatta, carne de panela desfiada, cebola roxa, Catupiry cremoso e rúcula fresca.', 'Sandwich', 5900),
('barbadog:ff7cbdf6-3607-4547-b15e-153c1dfb3d29', 'barbadog', 'Brasinha Salada', 'Pão, maionese verde, hambúrguer de 140g assadao na brasa, queijo prato, alface americana, tomate e picles.', 'Linha Brasinha', 4400),
('barbadog:68f0a63a-8e5c-4653-b203-04496e45426b', 'barbadog', 'Brasinha Cheeseburguer', 'Pão, maionese verde, hambúrguer de 140g assadao na brasa, queijo prato, picles e ketchup.', 'Linha Brasinha', 3300),
('barbadog:9329bff0-40f0-4f57-9fe7-768dd73758d4', 'barbadog', 'Brasinha Bacon', 'Pão, maionese verde, hambúrguer de 140g assadao na brasa, queijo prato, bacon em fatias e três aneis de cebola.', 'Linha Brasinha', 4400),
('barbadog:b61ee41b-3fa4-467b-8c8b-7097c8c44935', 'barbadog', 'Brasinha Chicken Jr', 'Pão, maionese verde, peito de frango empanado e frito, cheddar e cebola crispy.', 'Linha Brasinha', 3600),
('barbadog:8c5edb0c-546e-4b3f-88e4-6ac64b4d1256', 'barbadog', 'Chicken Popcorn', 'Iscas de frango frito (350g). Acompanha molhos sweet chilli e barbecue.', 'Porções', 4600),
('barbadog:744045f1-483a-4689-868c-f202ee6e0a1e', 'barbadog', 'Queijo Gouda Empanado', 'Queijo gouda empanado (10 unidades). Acompanha molho sweet chilli.', 'Porções', 3700),
('barbadog:e1469f2c-c6aa-4fd9-984a-9a6eb4c10673', 'barbadog', 'Onion Rings', 'Anéis de cebola (350g). Acompanha molho barbecue.', 'Porções', 3700),
('barbadog:027e0ef2-9abc-4dca-97c7-22e4111efaa2', 'barbadog', 'Dadinho de Tapioca', 'Dadinho de tapioca com queijos muçarela e coalho (8 un). Acompanha geleia de tomate.', 'Porções', 4400),
('barbadog:08ad9591-1f4b-4335-b892-20d4046eaddc', 'barbadog', 'Tortilhas de Milho Crocante', 'Tortilha de milho crocantes. Acompanha molhos: Guacamole, sour cream e Pico de Gallo.', 'Porções', 3700),
('barbadog:31e159bf-cb0a-4a41-bb15-158e560a0402', 'barbadog', 'Salada do Barba', 'Alface americana, rúcula, tomate cereja e crouton. Acompanha maionese temperada.', 'Porções', 3700),
('barbadog:39993ef6-0fc4-44fc-8281-5010754c5796', 'barbadog', 'Batata Waffles', 'Batata waffles (350g). Acompanha maionese temperada.', 'Batatas', 3700),
('barbadog:4d62659d-aa92-43e3-8be0-c3c75549c696', 'barbadog', 'Beef Melt Fries', 'Batata frita, carne de panela desfiada com barbecue, creme de queijos derretido. Acompanha sour cream.', 'Batatas', 6000),
('barbadog:94d70b1d-33cf-45cc-b452-18758673a424', 'barbadog', 'Batata Frita', 'Batata frita palito (350g). Acompanha maionese temperada.', 'Batatas', 3700),
('barbadog:695cb12f-11eb-4633-93dd-a85b6b85d663', 'barbadog', 'Batata Crinkles', 'Batata crinkles temperada (350g). Acompanha maionese temperada.', 'Batatas', 3700),
('barbadog:7b06c0cc-b882-493b-811a-555a132da1b7', 'barbadog', 'Barba Dream', 'Nosso clássico pão artesanal vira estrela em versão doce! Uma massa macia, frita na hora, envolta em açúcar e canela, recheada com uma generosa porção de creme (Nutella, doce de leite ou brigadeiro) e finalizada com pedaços crocantes de wafer. Uma sobremesa quente, cremosa e crocante na medida certa.', 'Sobremesas', 2700),
('barbadog:bb0610f8-7350-48f5-b0fa-d9a2ac1fc56d', 'barbadog', 'Brigadeiro Com Ovomaltine', 'Brigadeiro de colher com cobertura de Ovomaltine. Serve 1 pessoa.', 'Sobremesas', 1900),
('barbadog:4c02871b-f781-46a1-b4d8-dcf10c07db3c', 'barbadog', 'Brigadeiro com Negresco', 'Brigadeiro de colher com cobertura de Negresco. Serve 1 pessoa.', 'Sobremesas', 1900),
('barbadog:6321bff5-cb09-4e37-95f8-d4d19cefb4af', 'barbadog', 'Croissant Doce de Leite', 'Croissant com doce de leite e bolacha waffle', 'Sobremesas', 2999),
('barbadog:b7fc3df4-0fb3-4818-ae01-933306775a18', 'barbadog', 'Croissant Creme de Ovomaltine', '', 'Sobremesas', 3599),
('barbadog:4fb1f015-bd93-481e-9720-ce054c23fc9c', 'barbadog', 'Croissant Nutella', 'Croissant com Nutella e farofa de Negresco', 'Sobremesas', 3599),
('barbadog:5fa9c785-5a6a-4db8-9094-07d1c5a0fd87', 'barbadog', 'Cerveja Stannis 355ml Pilsener', '', 'Cerveja Stannis', 1399),
('barbadog:d2a6a494-eb6f-43d7-99db-17249316d678', 'barbadog', 'Cerveja Stannis 355ml Bright Ale', '', 'Cerveja Stannis', 2099),
('barbadog:52a0910f-bbb0-4eaa-929c-6a4596f02505', 'barbadog', 'Cerveja Stannis 355ml Dear Paula', '', 'Cerveja Stannis', 2099),
('barbadog:9ec11617-8a43-4246-ac47-760c941e2f9a', 'barbadog', 'Cerveja Stannis 355ml Red Sonja', '', 'Cerveja Stannis', 1899),
('barbadog:d0c0bad1-ac37-4a90-8ac2-de74c698f28c', 'barbadog', 'Cerveja Stannis 355ml Gold Amélia', '', 'Cerveja Stannis', 1999),
('barbadog:9c77bdab-4ff1-40d2-8c7c-9d03695daa2e', 'barbadog', 'Chope Em Growler Pilsener 1lt', '', 'Cerveja Stannis', 2899),
('barbadog:0775b917-d632-4ec5-90ab-3044ed4a5204', 'barbadog', 'Coca-Cola 600ml', 'Garrafa 600ml', 'Bebidas', 999),
('barbadog:b38a0093-7232-455f-9119-f7a11a811d4a', 'barbadog', 'Coca Cola Zero 600ml', 'Unidade 1un', 'Bebidas', 999),
('barbadog:afe1fd12-e905-4fcb-a862-b299c0c295e8', 'barbadog', 'Refrigerante Guarana Antartica Lata 350 Ml', '', 'Bebidas', 850),
('barbadog:e087a0ec-ecb9-4635-bcc8-e610d1ffcf54', 'barbadog', 'Coca Cola Zero 350 Ml', '', 'Bebidas', 850),
('barbadog:83f616c1-e487-45dc-9382-12ea8a009545', 'barbadog', 'Coca Cola 350 Ml', '', 'Bebidas', 850),
('barbadog:b64513f9-40df-4ce5-96d5-569d24481648', 'barbadog', 'Fanta Laranja 350 Ml', '', 'Bebidas', 850),
('barbadog:6e043501-e63e-4fcd-a4f1-6bb8640b2a36', 'barbadog', 'Fanta Uva 350ml', 'Lata 350ml', 'Bebidas', 850),
('barbadog:46d8b85d-3526-44e7-8f8a-732937b8aac3', 'barbadog', 'Refrigerante Original Sprite 350ml', 'Refrig Sprite Lt 350ml S/Acucar', 'Bebidas', 850),
('barbadog:6a121a06-558b-4ee2-8a34-66e0529fd0d6', 'barbadog', 'Água Crystal com Gás 500ml', 'Garrafa 500ml', 'Bebidas', 550),
('barbadog:cc80eed4-8854-400e-9e36-fa86fd7e1f93', 'barbadog', 'Agua Mineral Sem Gas Crystal 500ml', '', 'Bebidas', 550),
('barbadog:5dd8583e-0cde-4943-b6b8-4ce5fe135107', 'barbadog', 'Coca-Cola Zero Pet 200ml', '', 'Bebidas', 499),
('barbadog:7d96bf2e-1ab0-4a36-bf06-b9d167a9a3f3', 'barbadog', 'Refrigerante Mini Coca Cola', 'Frasco 30ml', 'Bebidas', 499),
('barbadog:e788b317-1010-4560-8f81-4053b26d44eb', 'barbadog', 'Suco Del Valle Pêssego 290ml', 'Lata 290ml', 'Bebidas', 850),
('barbadog:16cec65d-40ed-4144-a194-5a17c01ed05c', 'barbadog', 'Suco Del Valle Maracujá 290ml', 'Lata 290ml', 'Bebidas', 850),
('barbadog:a2f69a8f-bf89-4217-9392-dcbad7bc0519', 'barbadog', 'Suco Del Valle Pêssego 200ml', 'Embalagem 200ml', 'Bebidas', 850),
('barbadog:034f76e4-3009-4a82-af30-6ad46258147e', 'barbadog', 'Suco Del Valle Manga 290ml', 'Embalagem 290ml', 'Bebidas', 850),
('barbadog:1da7713d-7317-4961-b8b5-87612d0f6243', 'barbadog', 'Schweppes Citrus 350ml', 'Lata 350ml', 'Bebidas', 850),
('barbadog:3a61c14a-baa7-488d-b619-5f924700edc2', 'barbadog', 'Tônica Schweppes 350ml', 'Lata 350ml', 'Bebidas', 850),
('barbadog:73a8974b-c763-4ec8-9599-305542b50ef0', 'barbadog', 'Guacamole', '', 'Acompanhamentos', 800),
('barbadog:475cd757-b7f5-49c9-9bf1-11c3aafec192', 'barbadog', 'Sour Cream', '', 'Acompanhamentos', 800),
('barbadog:2fce8428-2f38-48a6-adfe-10ed60377631', 'barbadog', 'Pico De Galo', '', 'Acompanhamentos', 800),
('barbadog:87387afe-4338-406d-95ec-09f093be4bd4', 'barbadog', 'Chipotle', '', 'Acompanhamentos', 800),
('barbadog:f42947f5-3e82-436b-b7c9-8d6be74b74bb', 'barbadog', 'Adicional De Batata Palito', '', 'Acompanhamentos', 1200),
('barbadog:0c5fc966-0b47-420a-80e1-ec876973bcff', 'barbadog', 'Adicional De Batata Waffle', '', 'Acompanhamentos', 1200),
('barbadog:537b57a0-aba3-49d4-9c64-c4c83360f5a4', 'barbadog', 'Adicional De Batata Crinkle', '', 'Acompanhamentos', 1200),
('barbadog:60c44a24-e1a3-4d5c-9bb6-874da008151b', 'barbadog', 'Bacon', '', 'Acompanhamentos', 1100),
('barbadog:d90841d5-12dd-4e93-983e-ffee2d99866c', 'barbadog', 'Maionese Verde Temperada', '', 'Acompanhamentos', 700),
('barbadog:e3a80052-8255-455d-877f-cf7059bb641f', 'barbadog', 'Maionese Temperada', '', 'Acompanhamentos', 700),
('barbadog:297ab47b-197f-4cf4-a2ea-11b80a16df52', 'barbadog', 'Sweet Chili', '', 'Acompanhamentos', 800),
('barbadog:5d04af98-840d-4deb-8010-3c6eb337b377', 'barbadog', 'Barbecue', '', 'Acompanhamentos', 800),
('barbadog:a946bfce-dd1a-4697-8ff0-9a38e595d29a', 'barbadog', 'Geleia De Tomate', '', 'Acompanhamentos', 1200)
ON CONFLICT (catalog_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO erp_recipes (catalog_key, brand, name, description, category, sale_price_cents) VALUES
('chelas:1d200124-faa2-4ce9-b4aa-c587d34ea35f', 'chelas', 'Quesadilla de Frango', 'Tortilla de trigo, 200g de peito de frango com pimentões, creme de queijo e barbecue.', 'Quesadillas', 5200),
('chelas:28334ecb-d7f1-4131-8955-6a0999aa1b2d', 'chelas', 'Combo Chicano', 'Neste especial preparamos um combo com... 1 Quesadilla pulled Pork 1 Chilli Nachos (acompanha tortilhas de milho e molhos) 1 Quesadilla de Nutella', 'Combos', 16599),
('chelas:f8c2e0a0-77fb-4870-8afd-606a50a782fa', 'chelas', 'Quesadilla Veggie Chilli', 'Tortilla de trigo, 200g de chilli veggie (proteina de soja), sour cream, guacamole e creme de queijos.', 'Quesadillas', 4899),
('chelas:25802c18-2d90-448e-8455-58071104040a', 'chelas', 'Quesadilla Chillicious', 'Tortilla de trigo, 200g de chilli beans cozido lentamente, creme de queijos e guacamole.', 'Quesadillas', 5399),
('chelas:602f51e4-e722-4619-a7a7-1fd7eaf0f9bf', 'chelas', 'Combo Caliente', '1 Quesadilla Pulled pork 1 Quesadilla Carne de Panela 1 Quesadilla Nutella 1 Porção de Tortilhas Crocantes (acompanha molhos) 1 Coca Cola 600ml', 'Combos', 19400),
('chelas:96e34f21-8fb4-46a4-8c26-641175f6a431', 'chelas', 'Tacos Do Chelas', 'Monte seus próprios tacos em casa com o kit completo do Chelas! Tudo fresquinho e pronto pra você criar o seu taco perfeito Escolha uma proteína: • Pulled Pork desfiado • Carne de Panela suculenta • Chilli da casa ️ Acompanha: • Cheddar cremoso • Pico de Gallo fresco • Sour Cream da casa • Guacamole • Alface crocante • 4 tacos crocantes • 1 pacote de Doritos Original Tudo vem na caixinha pra montar em casa e viver o crunch mais crocante do Chelas!', 'Combos', 12999),
('chelas:5488dc1c-26b3-458f-b8bc-de227010fb2f', 'chelas', 'Quesadilla de Mussarela', 'Quesadilla de queijo mussarela. 4 fatias', 'Quesadillas', 3400),
('chelas:b5a0f4ba-18cf-49ce-98ba-a3fd4ba2c3ec', 'chelas', 'Quesadilla de Pulled Pork', 'Tortilla de trigo, 180g de carne suína desfiada, creme de queijo, molho chipotle, creme de queijos e molho barbecue.', 'Quesadillas', 5690),
('chelas:288e74de-e70e-40aa-83ce-607d916ac263', 'chelas', 'Quesadilla Carne de Panela', 'Tortilla de trigo, 200g de carne de panela desfiada, creme de queijo, pico de galo.', 'Quesadillas', 5899),
('chelas:d45ee388-8732-4111-8714-d07266257f5f', 'chelas', 'Quesadilla de Frango com Catupiry', 'Tortilla de trigo, frango, Catupiry cremoso e orégano.', 'Quesadillas', 5300),
('chelas:f1f3fd37-6801-4223-afe6-a3efb67f9c80', 'chelas', 'Burrito Chillicious', 'Tortilla de trigo, alface americana, aproximadamente 200g de chilli beans cozido lentamente, creme de queijos, arroz mexicano, guacamole.', 'Burritos', 5799),
('chelas:6f3cd5d1-7501-4c3c-8326-19da8d749ec1', 'chelas', 'Burrito de Frango', 'Tortilla de trigo, 200g de frango com pimentões, alface, arroz mexicano, creme de queijos e sour cream.', 'Burritos', 5600),
('chelas:44272453-d415-4c15-9c6d-5a9882350c1b', 'chelas', 'Burrito Burguer', 'Tortilla de trigo, hamburguer de 185g assado na brasa, arroz mexicano, alface, creme de queijos, molho chipottle e cebola roxa.', 'Burritos', 5899),
('chelas:fe1d13dc-1354-426e-80fe-ff3635119845', 'chelas', 'Burrito Chilli Veggie', 'Tortilla de trigo, 200g chilli de proteína de soja, alface, arroz mexicano, creme de queijo e guacamole.', 'Burritos', 4999),
('chelas:df1fdf20-3d0a-42de-97d7-67bef381ce23', 'chelas', 'Burrito Carne de Panela', 'Tortilla de trigo, 200g de carne de panela desfiada, alface, arroz mexicano, creme de queijos, guacamole, pico de galo.', 'Burritos', 5999),
('chelas:5d0f578f-a181-484e-a62e-963814792d33', 'chelas', 'Burrito Pulled Pork', 'Tortilla de trigo, 180g pulled pork, alface, arroz mexicano, creme de queijos, sour cream e molho barbecue.', 'Burritos', 5899),
('chelas:a0673099-cf87-452a-89d6-28cb7c81d2bd', 'chelas', 'Chicken Sweet Crispy', 'Tortilla de trigo, creme de queijos, arroz, alface americana, filé de sassami marinado e frito, barbecue e sweet chilli.', 'Burritos', 5500),
('chelas:d166f89f-70e9-46cb-9b7a-b796b9312fec', 'chelas', 'Burrito de Camarão', 'Tortilla de trigo, creme de queijos, alface americana, arroz, camarão empanado com chipotle e sour cream.', 'Burritos', 6900),
('chelas:7704e335-8566-48f5-9668-b22eb6ebdbb1', 'chelas', 'Chilli Nachos', 'Nachos crocante (140g), creme de queijo, chillicious (420g de chilli cozido lentamente). Acompanha molhos, pico de galo, guacamole e sour cream.', 'Nachos', 9599),
('chelas:d1d4d536-d0d6-483a-947a-97db53efeb07', 'chelas', 'Nacho Pulled Pork', 'Nachos crocante (140g), 400g de pulled pork, creme de queijos. Acompanha molhos, guacamole, sour cream e pico de galo.', 'Nachos', 9599),
('chelas:d18fe304-028f-4344-bba1-23135771555e', 'chelas', 'Chilli Bowl', 'Bowl com 420 g de chilli cozido lentamente + creme de queijo. *Acompanha nachos crocante (140g)', 'Nachos', 7999),
('chelas:41586c5f-78d3-4465-9ff2-7001e0cb473c', 'chelas', 'Nachos Chilli Vegetariano', 'Nachos crocante (140g), 420g de chillicious vegetariano (proteina de soja) e creme de queijos. Acompanha molhos pico de galo, guacamole e sour cream.', 'Nachos', 7799),
('chelas:22733db3-0412-4a77-b171-caa1d363779c', 'chelas', 'Croissant Double Smash', 'Croissant folhado amanteigado, com 2 smashes de 90g cada, queijo cheddar, bacon crocante e ketchup', 'Croissant', 5200),
('chelas:97121428-8d4c-4c0a-a89f-22144298914b', 'chelas', 'Tortilhas de Milho crocante', '140g de tortilhas crocante. *Acompanha Guacamole Sour Cream Pico de Galo', 'Porções', 3690),
('chelas:5fda2bd5-fb0c-4e5e-bc05-03a28d1f82f1', 'chelas', 'Batata frita', '', 'Porções', 3500),
('chelas:b9f215e4-901c-4c98-8e50-8c67f3d14b96', 'chelas', 'Batata Waffles', 'Batata fritas estilo waffles. Acompanha 1 maionese temperada.', 'Porções', 3500),
('chelas:f2fd8601-bf7a-492f-8545-0e5ed7838f43', 'chelas', 'Queijo Gouda empanado', '10 unidades de Queijo Gouda empanado, acompanha molho sweet chilli.', 'Porções', 3600),
('chelas:e7af1c8e-31f1-4363-ac2f-fd1f61d00112', 'chelas', 'Pollo loko', 'Nuggets de frango crocante! Acompanha molho sweet chilli e molho barbecue.', 'Porções', 4500),
('chelas:e647e039-7b05-47c9-a848-7beb255a51aa', 'chelas', 'Porção de batata Crinkle', '', 'Porções', 3500),
('chelas:8b30199f-0552-4cbc-b4d4-75c5248d8d31', 'chelas', 'Dadinhos de Tapioca', '8 Unidades de Dadinhos de Tapioca (Acompanha Geleia de Tomates)', 'Porções', 4400),
('chelas:32cb5f89-6c95-4ef7-8b3d-a9a6603cafcd', 'chelas', 'Beef Melt Fries', 'Batata frita, carne de panela desfiada com barbecue, creme de queijos derretido. Acompanha sour cream.', 'Porções', 5900),
('chelas:3775ff95-50b9-4545-a032-40da9606e5d6', 'chelas', 'Salada', 'Alface americana, rúcula, tomate cereja e crouton. Acompanha maionese temperada.', 'Porções', 3700),
('chelas:a9480073-8e48-4cc0-a4e1-f55f9261e458', 'chelas', 'Mini Churros', 'Acompanha doce de leite. *8 unidades.', 'Sobremesas', 2990),
('chelas:544bc890-6c60-4cec-907f-cb199e2d4ce2', 'chelas', 'Quesadilla de Nutella', '', 'Sobremesas', 3990),
('chelas:7f057442-4bbe-47ec-905d-a6af40bb8131', 'chelas', 'Quesadilla de Ovomaltine', '', 'Sobremesas', 3990),
('chelas:d4d43402-1901-40a5-acc3-1a476cab8127', 'chelas', 'Quesadilla doce de leite', '4 unidades de quesadilla recheada com doce de leite.', 'Sobremesas', 3290),
('chelas:a164bd8b-dfa5-4885-bb26-3dc9733d3e60', 'chelas', 'Brigadeiro de colher', '', 'Sobremesas', 2000),
('chelas:7777bd26-9884-4a38-a49e-6f8ac6e4aca3', 'chelas', 'Sobremesas de Ninho', 'Gelado de leite Ninho com cobertura de chocolate. Sabores -Geleia de Frutas Vermelhas -Surpresa de Uva -Strogonoff de nozes -Frutas Vermelhas', 'Sobremesas', 2900),
('chelas:de235239-2df5-434b-a4e1-303c3a433ddd', 'chelas', 'Croissant Nutella', 'Croissant com Nutella e farofa de Negresco', 'Sobremesas', 3599),
('chelas:a56b305d-03fe-4c8d-b1f1-9a9eba9b3f4a', 'chelas', 'Croissant Creme de Ovomaltine', '', 'Sobremesas', 3599),
('chelas:14094b42-674f-4a62-a038-ad65e10f9329', 'chelas', 'Croissant Doce de Leite', 'Croissant com doce de leite e bolacha waffle', 'Sobremesas', 2999),
('chelas:6c18c3b6-63a3-41bc-8b44-bf881b4be861', 'chelas', 'Coca Cola 200ml', '', 'Bebidas', 499),
('chelas:3f4d0c22-a176-4650-baa9-234345c38b13', 'chelas', 'Coca Cola 200ml Zero', '', 'Bebidas', 499),
('chelas:0e8af084-3451-4f8f-af95-2397dfc90c15', 'chelas', 'Coca-Cola Original 350ml', 'Lata 350ml', 'Bebidas', 850),
('chelas:8d3baea3-c9fb-4ee7-9ae2-c73a7d0e07d8', 'chelas', 'Refrigerante Coca Cola Lata Zero', 'Lata 350ml', 'Bebidas', 850),
('chelas:ba0c5ffb-15a0-450f-8233-2945d14d8e1e', 'chelas', 'Coca-Cola Original 600ml', 'Garrafa 600ml', 'Bebidas', 999),
('chelas:11f8ef56-b0c8-4b17-9c26-cb1c00378cf7', 'chelas', 'Coca Cola Zero 600ml', 'Unidade 1un', 'Bebidas', 999),
('chelas:f31c9314-f293-45bb-88eb-a619d95c070b', 'chelas', 'Coca-Cola Original 2l', 'Garrafa 2l', 'Bebidas', 1999),
('chelas:c43ab601-ef69-44f8-a0d1-859ddb7fb9d8', 'chelas', 'Refrigerante Guaraná Itubaina Retrô Garrafa 355ml', 'Garrafa 355ml', 'Bebidas', 850),
('chelas:1f1f16eb-974f-4214-81bc-1b2c11c3e710', 'chelas', 'Refrigerante Guaraná Antarctica Lata 350ml', 'Lata 350ml', 'Bebidas', 850),
('chelas:e0a31512-41e0-4f0d-9413-5bc993d510b6', 'chelas', 'Fanta Laranja 350ml', '', 'Bebidas', 850),
('chelas:0f79772c-f310-4b18-81dd-b93b53210540', 'chelas', 'Fanta Uva 350ml', '', 'Bebidas', 850),
('chelas:ca375677-208a-476a-a293-ee9b21655921', 'chelas', 'Sprite 350ml', '', 'Bebidas', 850),
('chelas:f942e468-4322-4a43-be53-5715a05cb459', 'chelas', 'Schweppes Citrus 350ml', '', 'Bebidas', 850),
('chelas:fb771bea-aefa-401b-a500-d92e524d2dcf', 'chelas', 'Coca cola Ks 250ml', 'Garrafa de vidro Ks 250ml', 'Bebidas', 850),
('chelas:b83f2445-c558-4b03-852b-4ca5c6c60b68', 'chelas', 'Coca Cola Zero 2 L Pet', 'Zero Açúcar', 'Bebidas', 1999),
('chelas:d1f6aa05-b99a-453e-a2b3-988e5d8ec46f', 'chelas', 'Coca Zero Ks 250ml', 'Garrafa de vidro Ks 250ml', 'Bebidas', 850),
('chelas:acda6982-0f75-4bd8-88a5-d3e44832e506', 'chelas', 'Suco de Laranja Natural 400ml', 'A partir de R$ 20,00', 'Bebidas', 2000),
('chelas:b750724a-1a5a-443f-9536-1eee17173a5f', 'chelas', 'Água', '', 'Bebidas', 550),
('chelas:74f7ad4d-0aaa-46b1-87d1-ada048f015b3', 'chelas', 'Cerveja Stannis Pilsner - 355 Ml', '', 'Cervejas', 1399),
('chelas:a52d6767-02c6-470a-9943-1cbec8ebfc57', 'chelas', 'Chope em Growler - Pilsner - 1lt', '', 'Cervejas', 2899),
('chelas:66f46504-012a-41bf-8be0-1fcf4da2e4dd', 'chelas', 'Cerveja Stannis Weiss 355ml', 'Cerveja de trigo longneck', 'Cervejas', 1899),
('chelas:59bcbedf-aefb-4ea3-8acd-cdaa29df86e7', 'chelas', 'Cerveja Stannis Gold Amelia 355ml', 'Uma Belgian Blonde Ale', 'Cervejas', 1999),
('chelas:351bdce0-52ab-4a9b-be5e-76bb9a3a2fba', 'chelas', 'Cerveja Stannis Red Sonja 355ml', '', 'Cervejas', 1899),
('chelas:a24246e9-19fb-4696-9cef-5ebf47345f58', 'chelas', 'Cerveja Stannis Dear Paula 355ml', '', 'Cervejas', 2099),
('chelas:eaa56b19-5c23-4e46-b36a-696c144b0892', 'chelas', 'Cerveja Stannis Brigit Ale 355ml', 'Cerveja American Pale Ale', 'Cervejas', 2099)
ON CONFLICT (catalog_key) DO NOTHING;
