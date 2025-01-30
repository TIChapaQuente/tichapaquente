import { supabase } from '../lib/supabase';
import axios from 'axios';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import QRCode from 'qrcode';
import { XmlSigner } from '../utils/xmlSigner';
import { sefazService } from './SEFAZService';

interface NFCeConfig {
  ambiente: number;
  certificadoPath: string;
  certificadoSenha: string;
  cnpj: string;
  inscricaoEstadual: string;
  razaoSocial: string;
  nomeFantasia: string;
  regimeTributario: number;
  endereco: {
    logradouro: string;
    numero: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    pais: string;
    codigoMunicipio: string;
  };
}

interface NFCeProduct {
  id: string;
  name: string;
  quantity: number;
  price: number;
  ncm: string;
  cfop: string;
}

interface NFCeCustomer {
  id: string;
  name: string;
  cnpj: string;
}

class NFCeService {
  private static instance: NFCeService;
  private config: NFCeConfig | null = null;
  private webserviceURLs = {
    homologacao: {
      autorizacao: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx',
      retAutorizacao: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRetAutorizacao4.asmx',
      inutilizacao: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeInutilizacao4.asmx',
      consulta: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx',
      status: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx',
      cancelamento: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx'
    },
    producao: {
      autorizacao: 'https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx',
      retAutorizacao: 'https://nfce.fazenda.sp.gov.br/ws/NFeRetAutorizacao4.asmx',
      inutilizacao: 'https://nfce.fazenda.sp.gov.br/ws/NFeInutilizacao4.asmx',
      consulta: 'https://nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx',
      status: 'https://nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx',
      cancelamento: 'https://nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx'
    }
  };

  private constructor() {}

  public static getInstance(): NFCeService {
    if (!NFCeService.instance) {
      NFCeService.instance = new NFCeService();
    }
    return NFCeService.instance;
  }

  public async initialize(): Promise<void> {
    const { data: config, error } = await supabase
      .from('fiscal_config')
      .select('*')
      .single();

    if (error) throw new Error('Erro ao carregar configurações fiscais');
    if (!config) throw new Error('Configurações fiscais não encontradas');

    this.config = {
      ambiente: config.ambiente,
      certificadoPath: config.certificado_path,
      certificadoSenha: config.certificado_senha,
      cnpj: config.cnpj,
      inscricaoEstadual: config.inscricao_estadual,
      razaoSocial: config.razao_social,
      nomeFantasia: config.nome_fantasia,
      regimeTributario: config.regime_tributario,
      endereco: {
        logradouro: config.endereco_logradouro,
        numero: config.endereco_numero,
        bairro: config.endereco_bairro,
        municipio: config.endereco_municipio,
        uf: config.endereco_uf,
        cep: config.endereco_cep,
        pais: config.endereco_pais,
        codigoMunicipio: config.endereco_codigo_municipio
      }
    };

    // Inicializar serviço SEFAZ
    await sefazService.initialize({
      certificatePath: this.config.certificadoPath,
      certificatePassword: this.config.certificadoSenha,
      ambiente: this.config.ambiente
    });
  }

  private getNextNFCeNumber = async (): Promise<{ numero: string; serie: string }> => {
    const { data, error } = await supabase
      .from('fiscal_notes')
      .select('numero_nota, serie')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw new Error('Erro ao obter próximo número de NFC-e');

    if (!data || data.length === 0) {
      return { numero: '000000001', serie: '001' };
    }

    const lastNumber = parseInt(data[0].numero_nota);
    const nextNumber = (lastNumber + 1).toString().padStart(9, '0');
    return { numero: nextNumber, serie: data[0].serie };
  };

  private generateChaveAcesso = (uf: string, dataEmissao: Date, cnpj: string, modelo: string, serie: string, numero: string, tpEmis: string, cNF: string): string => {
    const ano = dataEmissao.getFullYear().toString().slice(2);
    const mes = (dataEmissao.getMonth() + 1).toString().padStart(2, '0');
    
    // Concatena os campos
    const chave = `${uf}${ano}${mes}${cnpj}${modelo}${serie}${numero}${tpEmis}${cNF}`;
    
    // Calcula o DV (módulo 11)
    let soma = 0;
    let peso = 2;
    
    for (let i = chave.length - 1; i >= 0; i--) {
      soma += parseInt(chave[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    
    const dv = 11 - (soma % 11);
    const digitoVerificador = dv === 10 || dv === 11 ? '0' : dv.toString();
    
    return chave + digitoVerificador;
  };

  private async generateQRCode(chaveAcesso: string, url: string): Promise<string> {
    try {
      return await QRCode.toDataURL(url);
    } catch (error) {
      console.error('Erro ao gerar QR Code:', error);
      throw new Error('Erro ao gerar QR Code');
    }
  }

  private buildNFCeXML = (
    products: NFCeProduct[],
    customer: NFCeCustomer,
    numero: string,
    serie: string,
    chaveAcesso: string
  ): string => {
    if (!this.config) throw new Error('Configurações não inicializadas');

    const dataEmissao = new Date().toISOString();
    const valorTotal = products.reduce((sum, prod) => sum + (prod.quantity * prod.price), 0);

    const nfce = {
      'nfeProc': {
        '@xmlns': 'http://www.portalfiscal.inf.br/nfe',
        'NFe': {
          '@xmlns': 'http://www.portalfiscal.inf.br/nfe',
          'infNFe': {
            '@Id': `NFe${chaveAcesso}`,
            '@versao': '4.00',
            'ide': {
              'cUF': '35', // SP
              'cNF': chaveAcesso.slice(-8),
              'natOp': 'VENDA',
              'mod': '65',
              'serie': serie,
              'nNF': numero,
              'dhEmi': dataEmissao,
              'tpNF': '1',
              'idDest': '1',
              'cMunFG': this.config.endereco.codigoMunicipio,
              'tpImp': '4',
              'tpEmis': '1',
              'cDV': chaveAcesso.slice(-1),
              'tpAmb': this.config.ambiente.toString(),
              'finNFe': '1',
              'indFinal': '1',
              'indPres': '1',
              'procEmi': '0',
              'verProc': '1.0.0'
            },
            'emit': {
              'CNPJ': this.config.cnpj,
              'xNome': this.config.razaoSocial,
              'xFant': this.config.nomeFantasia,
              'enderEmit': {
                'xLgr': this.config.endereco.logradouro,
                'nro': this.config.endereco.numero,
                'xBairro': this.config.endereco.bairro,
                'cMun': this.config.endereco.codigoMunicipio,
                'xMun': this.config.endereco.municipio,
                'UF': this.config.endereco.uf,
                'CEP': this.config.endereco.cep,
                'cPais': '1058',
                'xPais': 'Brasil'
              },
              'IE': this.config.inscricaoEstadual,
              'CRT': this.config.regimeTributario.toString()
            },
            'dest': {
              'CNPJ': customer.cnpj.replace(/\D/g, ''),
              'xNome': customer.name
            },
            'det': products.map((prod, index) => ({
              '@nItem': (index + 1).toString(),
              'prod': {
                'cProd': prod.id,
                'cEAN': 'SEM GTIN',
                'xProd': prod.name,
                'NCM': prod.ncm,
                'CFOP': prod.cfop,
                'uCom': 'UN',
                'qCom': prod.quantity.toString(),
                'vUnCom': prod.price.toFixed(2),
                'vProd': (prod.quantity * prod.price).toFixed(2),
                'cEANTrib': 'SEM GTIN',
                'uTrib': 'UN',
                'qTrib': prod.quantity.toString(),
                'vUnTrib': prod.price.toFixed(2),
                'indTot': '1'
              },
              'imposto': {
                'ICMS': {
                  'ICMSSN102': {
                    'orig': '0',
                    'CSOSN': '102'
                  }
                },
                'PIS': {
                  'PISOutr': {
                    'CST': '99',
                    'vBC': '0.00',
                    'pPIS': '0.00',
                    'vPIS': '0.00'
                  }
                },
                'COFINS': {
                  'COFINSOutr': {
                    'CST': '99',
                    'vBC': '0.00',
                    'pCOFINS': '0.00',
                    'vCOFINS': '0.00'
                  }
                }
              }
            })),
            'total': {
              'ICMSTot': {
                'vBC': '0.00',
                'vICMS': '0.00',
                'vICMSDeson': '0.00',
                'vFCP': '0.00',
                'vBCST': '0.00',
                'vST': '0.00',
                'vFCPST': '0.00',
                'vFCPSTRet': '0.00',
                'vProd': valorTotal.toFixed(2),
                'vFrete': '0.00',
                'vSeg': '0.00',
                'vDesc': '0.00',
                'vII': '0.00',
                'vIPI': '0.00',
                'vIPIDevol': '0.00',
                'vPIS': '0.00',
                'vCOFINS': '0.00',
                'vOutro': '0.00',
                'vNF': valorTotal.toFixed(2)
              }
            },
            'transp': {
              'modFrete': '9'
            },
            'pag': {
              'detPag': {
                'tPag': '01',
                'vPag': valorTotal.toFixed(2)
              }
            }
          }
        }
      }
    };

    const builder = new XMLBuilder({
      attributeNamePrefix: '@',
      ignoreAttributes: false,
      format: true
    });

    return builder.build(nfce);
  };

  private async signXML(xml: string): Promise<string> {
    if (!this.config) throw new Error('Configurações não inicializadas');

    const signer = new XmlSigner(
      this.config.certificadoPath,
      this.config.certificadoSenha
    );

    return await signer.sign(xml, {
      certificatePath: this.config.certificadoPath,
      certificatePassword: this.config.certificadoSenha,
      referenceUri: '#NFe' + xml.match(/Id="NFe([^"]+)"/)?.[1]
    });
  }

  private async sendToSEFAZ(xml: string): Promise<any> {
    // Verificar status do serviço
    const isOnline = await sefazService.checkStatus();
    if (!isOnline) {
      throw new Error('Serviço da SEFAZ está indisponível');
    }

    // Enviar NFC-e
    const response = await sefazService.sendNFCe(xml);
    
    if (response.status === 'erro') {
      throw new Error(`Erro ao enviar NFC-e: ${response.motivo}`);
    }

    return response;
  }

  public async emitirNFCe(products: NFCeProduct[], customer: NFCeCustomer) {
    try {
      if (!this.config) await this.initialize();

      // 1. Obter próximo número da nota
      const { numero, serie } = await this.getNextNFCeNumber();

      // 2. Gerar chave de acesso
      const dataEmissao = new Date();
      const chaveAcesso = this.generateChaveAcesso(
        '35', // SP
        dataEmissao,
        this.config!.cnpj,
        '65', // Modelo NFC-e
        serie,
        numero,
        '1', // Tipo de Emissão - Normal
        numero.slice(-8)
      );

      // 3. Gerar XML
      const xml = this.buildNFCeXML(products, customer, numero, serie, chaveAcesso);

      // 4. Assinar XML digitalmente
      const xmlAssinado = await this.signXML(xml);

      // 5. Enviar para SEFAZ
      const response = await this.sendToSEFAZ(xmlAssinado);

      // 6. Processar resposta
      if (response.status === 'autorizado') {
        // 7. Salvar nota fiscal no banco
        const { data: fiscal_note, error } = await supabase
          .from('fiscal_notes')
          .insert({
            chave_acesso: chaveAcesso,
            numero_nota: numero,
            serie: serie,
            data_emissao: dataEmissao.toISOString(),
            valor_total: products.reduce((sum, prod) => sum + (prod.quantity * prod.price), 0),
            status: 'autorizada',
            protocolo: response.protocolo,
            xml_autorizado: response.xmlAutorizado,
            customer_id: customer.id
          })
          .select()
          .single();

        if (error) throw new Error('Erro ao salvar nota fiscal');

        // 8. Salvar itens da nota
        const items = products.map(prod => ({
          fiscal_note_id: fiscal_note.id,
          product_id: prod.id,
          quantidade: prod.quantity,
          valor_unitario: prod.price,
          valor_total: prod.quantity * prod.price,
          ncm: prod.ncm,
          cfop: prod.cfop
        }));

        const { error: itemsError } = await supabase
          .from('fiscal_note_items')
          .insert(items);

        if (itemsError) throw new Error('Erro ao salvar itens da nota fiscal');

        // 9. Gerar QR Code
        const qrCodeUrl = `${this.config!.ambiente === 1 
          ? 'https://www.nfce.fazenda.sp.gov.br/qrcode' 
          : 'https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode'}?chNFe=${chaveAcesso}&nVersao=100`;
        
        const qrCodeImage = await this.generateQRCode(chaveAcesso, qrCodeUrl);

        return {
          success: true,
          data: {
            chaveAcesso,
            numero,
            serie,
            protocolo: response.protocolo,
            qrCode: qrCodeImage,
            url: qrCodeUrl
          }
        };
      } else {
        throw new Error(`Nota fiscal rejeitada: ${response.motivo}`);
      }
    } catch (error) {
      console.error('Erro ao emitir NFC-e:', error);
      throw error;
    }
  }
}

export const nfceService = NFCeService.getInstance();
