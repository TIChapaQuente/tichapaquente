import { SignedXml } from 'xml-crypto';
import { readFileSync } from 'fs';
import { X509Certificate } from 'crypto';

interface SignatureOptions {
  certificatePath: string;
  certificatePassword: string;
  referenceUri: string;
}

export class XmlSigner {
  private certificate: Buffer;
  private password: string;

  constructor(certificatePath: string, certificatePassword: string) {
    this.certificate = readFileSync(certificatePath);
    this.password = certificatePassword;
  }

  public async sign(xml: string, options: SignatureOptions): Promise<string> {
    const sig = new SignedXml();

    // Configurar o certificado
    sig.signingKey = this.certificate;
    sig.signingKeyPassword = this.password;

    // Configurar a assinatura
    sig.addReference(
      options.referenceUri,
      [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
      ],
      'http://www.w3.org/2000/09/xmldsig#sha1',
      '',
      '',
      '',
      true
    );

    // Configurar o certificado X509
    const cert = new X509Certificate(this.certificate);
    sig.keyInfoProvider = {
      getKeyInfo: () => {
        return `<X509Data><X509Certificate>${cert.toString().replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g, '')}</X509Certificate></X509Data>`;
      }
    };

    // Assinar o XML
    sig.computeSignature(xml);
    return sig.getSignedXml();
  }
}
