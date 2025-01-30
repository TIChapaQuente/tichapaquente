-- Tabela para armazenar as notas fiscais
CREATE TABLE fiscal_notes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    chave_acesso VARCHAR(44) NOT NULL,
    numero_nota VARCHAR(9) NOT NULL,
    serie VARCHAR(3) NOT NULL,
    data_emissao TIMESTAMP WITH TIME ZONE NOT NULL,
    valor_total DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'autorizada', 'cancelada', 'rejeitada'
    protocolo VARCHAR(15),
    xml_autorizado TEXT,
    xml_cancelamento TEXT,
    customer_id UUID REFERENCES customers(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela para armazenar os itens das notas fiscais
CREATE TABLE fiscal_note_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    fiscal_note_id UUID REFERENCES fiscal_notes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantidade DECIMAL(10,3) NOT NULL,
    valor_unitario DECIMAL(10,2) NOT NULL,
    valor_total DECIMAL(10,2) NOT NULL,
    ncm VARCHAR(8) NOT NULL,
    cfop VARCHAR(4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela para configurações do certificado e SEFAZ
CREATE TABLE fiscal_config (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ambiente INTEGER NOT NULL DEFAULT 2, -- 1=Produção, 2=Homologação
    certificado_path TEXT,
    certificado_senha TEXT,
    cnpj VARCHAR(14) NOT NULL,
    inscricao_estadual VARCHAR(20) NOT NULL,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    regime_tributario INTEGER NOT NULL DEFAULT 1, -- 1=Simples Nacional
    endereco_logradouro VARCHAR(255) NOT NULL,
    endereco_numero VARCHAR(10) NOT NULL,
    endereco_bairro VARCHAR(100) NOT NULL,
    endereco_municipio VARCHAR(100) NOT NULL,
    endereco_uf CHAR(2) NOT NULL,
    endereco_cep VARCHAR(8) NOT NULL,
    endereco_pais VARCHAR(50) DEFAULT 'Brasil',
    endereco_codigo_municipio VARCHAR(7) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_fiscal_config UNIQUE (cnpj)
);

-- Índices para melhor performance
CREATE INDEX idx_fiscal_notes_chave_acesso ON fiscal_notes(chave_acesso);
CREATE INDEX idx_fiscal_notes_data_emissao ON fiscal_notes(data_emissao);
CREATE INDEX idx_fiscal_notes_customer_id ON fiscal_notes(customer_id);
CREATE INDEX idx_fiscal_note_items_fiscal_note_id ON fiscal_note_items(fiscal_note_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_fiscal_notes_updated_at
    BEFORE UPDATE ON fiscal_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fiscal_config_updated_at
    BEFORE UPDATE ON fiscal_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Políticas de segurança
ALTER TABLE fiscal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated users" ON fiscal_notes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" ON fiscal_notes
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable read for authenticated users" ON fiscal_note_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" ON fiscal_note_items
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON fiscal_config
    FOR ALL TO authenticated USING (true);
