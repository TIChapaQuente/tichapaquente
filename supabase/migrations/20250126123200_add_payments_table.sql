-- Adiciona campos de pagamento na tabela orders existente
ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- Criar tabela de pagamentos
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    pix_code TEXT,
    pix_expiration TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Função para atualizar o status do pedido quando o pagamento for confirmado
CREATE OR REPLACE FUNCTION update_order_payment_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' THEN
        UPDATE orders 
        SET payment_status = 'completed',
            status = CASE 
                WHEN payment_method = 'pix' THEN 'pending'
                ELSE status 
            END
        WHERE id = NEW.order_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar o status do pedido
DROP TRIGGER IF EXISTS on_payment_status_change ON payments;
CREATE TRIGGER on_payment_status_change
    AFTER UPDATE OF status ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_order_payment_status();

-- Políticas de segurança
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Permitir SELECT para todos
CREATE POLICY "Permitir select para todos"
    ON payments FOR SELECT
    USING (true);

-- Permitir UPDATE apenas para admins
CREATE POLICY "Apenas admin pode atualizar pagamentos"
    ON payments FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE auth.uid() = users.id 
            AND role = 'admin'
        )
    );

-- Permitir INSERT para todos
CREATE POLICY "Permitir insert para todos"
