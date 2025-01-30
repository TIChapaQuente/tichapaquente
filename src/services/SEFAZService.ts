import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { readFileSync } from 'fs';
import { XMLParser } from 'fast-xml-parser';

interface SEFAZConfig {
  certificatePath: string;
  certificatePassword: string;
  ambiente: number; // 1=Produção, 2=Homologação
}

interface SEFAZResponse {
  status: 'autorizado' | 'rejeitado' | 'erro';
  protocolo?: string;
  xmlAutorizado?: string;
  motivo: string;
  codigoStatus?: string;
}

export class SEFAZService {
  private static instance: SEFAZService;
  private config: SEFAZConfig | null = null;
  private axiosInstance: AxiosInstance | null = null;
  private parser: XMLParser;

  private constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@'
    });
  }

  public static getInstance(): SEFAZService {
    if (!SEFAZService.instance) {
      SEFAZService.instance = new SEFAZService();
    }
    return SEFAZService.instance;
  }

  public async initialize(config: SEFAZConfig): Promise<void> {
    this.config = config;

    // Configurar cliente HTTPS com certificado
    const httpsAgent = new https.Agent({
      pfx: readFileSync(config.certificatePath),
      passphrase: config.certificatePassword,
      rejectUnauthorized: true
    });

    this.axiosInstance = axios.create({
      httpsAgent,
      headers: {
        'Content-Type': 'text/xml;charset=utf-8',
        'SOAPAction': ''
      }
    });
  }

  private getEndpoint(service: string): string {
    const baseUrl = this.config?.ambiente === 1
      ? 'https://nfce.fazenda.sp.gov.br/ws'
      : 'https://homologacao.nfce.fazenda.sp.gov.br/ws';

    const endpoints = {
      status: `${baseUrl}/NFeStatusServico4.asmx`,
      autorizacao: `${baseUrl}/NFeAutorizacao4.asmx`,
      retAutorizacao: `${baseUrl}/NFeRetAutorizacao4.asmx`,
      inutilizacao: `${baseUrl}/NFeInutilizacao4.asmx`,
      consulta: `${baseUrl}/NFeConsultaProtocolo4.asmx`,
      cancelamento: `${baseUrl}/NFeRecepcaoEvento4.asmx`
    };

    return endpoints[service as keyof typeof endpoints];
  }

  private buildSoapEnvelope(content: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                 xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    ${content}
  </soap12:Body>
</soap12:Envelope>`;
  }

  public async checkStatus(): Promise<boolean> {
    if (!this.axiosInstance) throw new Error('Serviço não inicializado');

    const content = `
<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">
  <consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <tpAmb>${this.config?.ambiente}</tpAmb>
    <cUF>35</cUF>
    <xServ>STATUS</xServ>
  </consStatServ>
</nfeDadosMsg>`;

    try {
      const response = await this.axiosInstance.post(
        this.getEndpoint('status'),
        this.buildSoapEnvelope(content)
      );

      const result = this.parser.parse(response.data);
      const status = result['soap:Envelope']['soap:Body'].nfeResultMsg.retConsStatServ;

      return status.cStat === '107'; // 107 = Serviço em Operação
    } catch (error) {
      console.error('Erro ao verificar status do serviço:', error);
      return false;
    }
  }

  public async sendNFCe(xmlAssinado: string): Promise<SEFAZResponse> {
    if (!this.axiosInstance) throw new Error('Serviço não inicializado');

    try {
      // 1. Enviar lote
      const loteContent = `
<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
  <enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <idLote>${Date.now()}</idLote>
    <indSinc>1</indSinc>
    ${xmlAssinado}
  </enviNFe>
</nfeDadosMsg>`;

      const response = await this.axiosInstance.post(
        this.getEndpoint('autorizacao'),
        this.buildSoapEnvelope(loteContent)
      );

      // 2. Processar resposta
      const result = this.parser.parse(response.data);
      const retorno = result['soap:Envelope']['soap:Body'].nfeResultMsg.retEnviNFe;

      // 3. Verificar status
      if (retorno.cStat === '104') { // Lote processado
        const protNFe = retorno.protNFe;
        
        if (protNFe.infProt.cStat === '100') { // Autorizado
          return {
            status: 'autorizado',
            protocolo: protNFe.infProt.nProt,
            xmlAutorizado: response.data,
            motivo: protNFe.infProt.xMotivo,
            codigoStatus: protNFe.infProt.cStat
          };
        } else {
          return {
            status: 'rejeitado',
            motivo: protNFe.infProt.xMotivo,
            codigoStatus: protNFe.infProt.cStat
          };
        }
      } else {
        return {
          status: 'erro',
          motivo: retorno.xMotivo,
          codigoStatus: retorno.cStat
        };
      }
    } catch (error) {
      console.error('Erro ao enviar NFC-e:', error);
      return {
        status: 'erro',
        motivo: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  public async cancelarNFCe(
    chaveAcesso: string,
    protocolo: string,
    justificativa: string
  ): Promise<SEFAZResponse> {
    if (!this.axiosInstance) throw new Error('Serviço não inicializado');

    try {
      const evento = `
<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
  <envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
    <idLote>${Date.now()}</idLote>
    <evento versao="1.00">
      <infEvento Id="ID${chaveAcesso}01">
        <cOrgao>35</cOrgao>
        <tpAmb>${this.config?.ambiente}</tpAmb>
        <CNPJ>${chaveAcesso.substr(6, 14)}</CNPJ>
        <chNFe>${chaveAcesso}</chNFe>
        <dhEvento>${new Date().toISOString()}</dhEvento>
        <tpEvento>110111</tpEvento>
        <nSeqEvento>1</nSeqEvento>
        <verEvento>1.00</verEvento>
        <detEvento versao="1.00">
          <descEvento>Cancelamento</descEvento>
          <nProt>${protocolo}</nProt>
          <xJust>${justificativa}</xJust>
        </detEvento>
      </infEvento>
    </evento>
  </envEvento>
</nfeDadosMsg>`;

      const response = await this.axiosInstance.post(
        this.getEndpoint('cancelamento'),
        this.buildSoapEnvelope(evento)
      );

      const result = this.parser.parse(response.data);
      const retorno = result['soap:Envelope']['soap:Body'].nfeResultMsg.retEnvEvento;

      if (retorno.cStat === '128') { // Lote de Evento Processado
        const retEvento = retorno.retEvento;
        
        if (retEvento.infEvento.cStat === '135') { // Evento registrado e vinculado a NF-e
          return {
            status: 'autorizado',
            protocolo: retEvento.infEvento.nProt,
            xmlAutorizado: response.data,
            motivo: retEvento.infEvento.xMotivo,
            codigoStatus: retEvento.infEvento.cStat
          };
        } else {
          return {
            status: 'rejeitado',
            motivo: retEvento.infEvento.xMotivo,
            codigoStatus: retEvento.infEvento.cStat
          };
        }
      } else {
        return {
          status: 'erro',
          motivo: retorno.xMotivo,
          codigoStatus: retorno.cStat
        };
      }
    } catch (error) {
      console.error('Erro ao cancelar NFC-e:', error);
      return {
        status: 'erro',
        motivo: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }
}

export const sefazService = SEFAZService.getInstance();
