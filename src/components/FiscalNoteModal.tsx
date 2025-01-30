import React, { useState } from 'react';
import { X, Plus, Printer, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Product {
  name: string;
  quantity: number;
  price: number;
}

interface FiscalNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FiscalNoteModal: React.FC<FiscalNoteModalProps> = ({ isOpen, onClose }) => {
  const [product, setProduct] = useState<Product>({
    name: '',
    quantity: 1,
    price: 0
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddProduct = () => {
    if (!product.name || product.quantity <= 0 || product.price <= 0) {
      toast.error('Preencha todos os campos do produto corretamente');
      return;
    }
    setProducts([...products, product]);
    setProduct({ name: '', quantity: 1, price: 0 });
  };

  const removeProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return products.reduce((sum, prod) => sum + (prod.quantity * prod.price), 0);
  };

  const generateNFCe = async () => {
    // Aqui você implementaria a chamada para o webservice da SEFAZ
    // Este é um exemplo do objeto que seria enviado
    const nfceData = {
      emit: {
        CNPJ: "XX.XXX.XXX/XXXX-XX",
        xNome: "TI CHAPA QUENTE",
        xFant: "TI CHAPA QUENTE",
        IE: "XXXXXXXXX",
        CRT: "1", // Simples Nacional
        enderEmit: {
          xLgr: "Rua Exemplo",
          nro: "123",
          xBairro: "Centro",
          cMun: "3550308", // Código IBGE da cidade
          xMun: "São Paulo",
          UF: "SP",
          CEP: "00000000",
          cPais: "1058",
          xPais: "Brasil"
        }
      },
      dest: {
        CNPJ: cnpj.replace(/\D/g, ''),
        xNome: customerName
      },
      det: products.map((prod, index) => ({
        nItem: index + 1,
        prod: {
          cProd: (index + 1).toString(),
          xProd: prod.name,
          NCM: "21069090", // Código NCM do produto
          CFOP: "5102", // Código Fiscal de Operações
          uCom: "UN",
          qCom: prod.quantity,
          vUnCom: prod.price,
          vProd: prod.quantity * prod.price
        },
        imposto: {
          ICMS: {
            ICMSSN102: { // Simples Nacional
              orig: "0",
              CSOSN: "102"
            }
          }
        }
      })),
      total: {
        ICMSTot: {
          vNF: calculateTotal()
        }
      }
    };

    return nfceData;
  };

  const handlePrint = async () => {
    if (!customerName || !cnpj || products.length === 0) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setLoading(true);
    try {
      // 1. Gerar NFC-e
      const nfceData = await generateNFCe();
      
      // 2. Aqui você enviaria para o webservice da SEFAZ
      // const response = await api.post('sefaz/nfce', nfceData);
      // const { chaveAcesso, protocolo } = response.data;
      
      // Simulando chave de acesso e protocolo
      const chaveAcesso = "35" + new Date().getFullYear() + "01" + "XX.XXX.XXX/XXXX-XX" + "65" + "001" + "000000001" + "1" + "00000001";
      const protocolo = Date.now().toString();

      // 3. Imprimir cupom
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Por favor, permita popups para imprimir o cupom fiscal');
        return;
      }

      const currentDate = new Date().toLocaleString('pt-BR');
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Cupom Fiscal - ${currentDate}</title>
          <style>
            @page {
              margin: 0;
              size: 80mm 297mm;
            }
            body {
              font-family: 'Courier New', monospace;
              margin: 0;
              padding: 10px;
              width: 80mm;
              font-size: 8pt;
            }
            .header {
              text-align: center;
              margin-bottom: 10px;
              border-bottom: 1px dashed #000;
              padding-bottom: 10px;
            }
            .company-name {
              font-size: 12pt;
              font-weight: bold;
            }
            .title {
              font-size: 10pt;
              margin: 5px 0;
            }
            .info {
              margin: 5px 0;
            }
            .products {
              width: 100%;
              border-collapse: collapse;
              margin: 10px 0;
            }
            .products th, .products td {
              text-align: left;
              padding: 3px;
            }
            .total {
              text-align: right;
              font-weight: bold;
              margin: 10px 0;
              border-top: 1px dashed #000;
              padding-top: 10px;
            }
            .footer {
              text-align: center;
              margin-top: 10px;
              border-top: 1px dashed #000;
              padding-top: 10px;
              font-size: 7pt;
            }
            .qrcode {
              text-align: center;
              margin: 10px 0;
            }
            @media print {
              body {
                width: 80mm;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">TI CHAPA QUENTE</div>
            <div>CNPJ: XX.XXX.XXX/XXXX-XX</div>
            <div>IE: XXXXXXXXX</div>
            <div>Rua Exemplo, 123 - Centro</div>
            <div>São Paulo - SP</div>
          </div>

          <div class="title">
            CUPOM FISCAL ELETRÔNICO - SAT
          </div>

          <div class="info">
            Data: ${currentDate}<br>
            COO: ${Math.floor(Math.random() * 100000).toString().padStart(6, '0')}<br>
            Cliente: ${customerName}<br>
            CNPJ: ${cnpj}
          </div>

          <table class="products">
            <thead>
              <tr>
                <th>ITEM</th>
                <th>DESCRIÇÃO</th>
                <th>QTD</th>
                <th>VL UN</th>
                <th>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${products.map((p, index) => `
                <tr>
                  <td>${(index + 1).toString().padStart(3, '0')}</td>
                  <td>${p.name}</td>
                  <td>${p.quantity}</td>
                  <td>${p.price.toFixed(2)}</td>
                  <td>${(p.quantity * p.price).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="total">
            TOTAL R$ ${calculateTotal().toFixed(2)}
          </div>

          <div class="footer">
            Chave de Acesso:<br>
            ${chaveAcesso}<br><br>
            Protocolo de Autorização:<br>
            ${protocolo}<br><br>
            Consulte pela Chave de Acesso em:<br>
            www.nfce.fazenda.sp.gov.br
          </div>

          <div class="qrcode">
            [QR Code será gerado pela SEFAZ]<br>
            Consulte pela Chave de Acesso
          </div>
        </body>
        </html>
      `);

      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);

      toast.success('Cupom fiscal emitido com sucesso!');
      onClose();
    } catch (error) {
      console.error('Erro ao emitir cupom fiscal:', error);
      toast.error('Erro ao emitir cupom fiscal');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[800px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-xl font-semibold text-gray-800">
            Emitir Cupom Fiscal
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Cliente Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome do Cliente
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500"
                placeholder="Digite o nome do cliente"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CNPJ
              </label>
              <input
                type="text"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500"
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>

          {/* Adicionar Produto */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
              Adicionar Produto
            </h3>
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do Produto
                </label>
                <input
                  type="text"
                  value={product.name}
                  onChange={(e) => setProduct({ ...product, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500"
                  placeholder="Digite o nome do produto"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantidade
                </label>
                <input
                  type="number"
                  min="1"
                  value={product.quantity}
                  onChange={(e) => setProduct({ ...product, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preço (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={product.price}
                  onChange={(e) => setProduct({ ...product, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>
            <button
              onClick={handleAddProduct}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <Plus className="h-5 w-5 mr-2" />
              Adicionar Produto
            </button>
          </div>

          {/* Lista de Produtos */}
          {products.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 border-b pb-2">
                Produtos Adicionados
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Produto
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qtd
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Preço Unit.
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {products.map((p, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {p.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {p.quantity}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          R$ {p.price.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          R$ {(p.quantity * p.price).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <button
                            onClick={() => removeProduct(index)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between sticky bottom-0">
          <div className="text-lg font-medium text-gray-900">
            Total: R$ {calculateTotal().toFixed(2)}
          </div>
          <div className="space-x-3">
            <button
              onClick={onClose}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Cancelar
            </button>
            <button
              onClick={handlePrint}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              <Printer className="h-5 w-5 mr-2" />
              {loading ? 'Emitindo...' : 'Emitir Cupom'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FiscalNoteModal;
