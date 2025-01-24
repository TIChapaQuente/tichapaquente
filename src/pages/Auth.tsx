import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import logoImg from '../assets/logo.png';

// Funções de formatação
const formatPhone = (phone: string) => {
  // Remove todos os caracteres não numéricos
  return phone.replace(/\D/g, '');
};

const formatName = (name: string) => {
  // Remove espaços extras e capitaliza as palavras
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Componente Modal
const Modal = ({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: React.ReactNode }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-96 relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
};

interface UserData {
  name: string;
  phone: string;
  created_at: string;
}

export function Auth() {
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [forgotPhone, setForgotPhone] = useState('');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [userNotFound, setUserNotFound] = useState(false);
  const navigate = useNavigate();

  // Função para formatar o telefone enquanto digita
  const handlePhoneChange = (value: string, field: 'main' | 'forgot') => {
    // Formata o número conforme digita: (99) 99999-9999
    const cleaned = value.replace(/\D/g, '');
    let formatted = cleaned;
    
    if (cleaned.length >= 11) {
      formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7, 11)}`;
    } else if (cleaned.length >= 7) {
      formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length >= 2) {
      formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
    }
    
    if (field === 'main') {
      setPhone(formatted);
    } else {
      setForgotPhone(formatted);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!name || !phone) {
        toast.error('Preencha todos os campos');
        return;
      }

      // Formata os dados antes de usar
      const cleanPhone = formatPhone(phone);
      const cleanName = formatName(name);

      if (isLogin) {
        // Tentar fazer login
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('phone', cleanPhone)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            toast.error('Usuário não encontrado');
          } else {
            throw error;
          }
          return;
        }

        if (formatName(user.name).toLowerCase() !== cleanName.toLowerCase()) {
          toast.error('Nome incorreto');
          return;
        }

        // Login bem sucedido
        const { error: sessionError } = await supabase.auth.signInWithPassword({
          email: `${cleanPhone}@temp.com`,
          password: cleanPhone
        });

        if (sessionError) throw sessionError;

        localStorage.setItem('user', JSON.stringify(user));
        toast.success('Login realizado com sucesso!');
        navigate('/');
      } else {
        // Verificar se já existe usuário com este telefone
        const { data: existingUser } = await supabase
          .from('users')
          .select('*')
          .eq('phone', cleanPhone)
          .single();

        if (existingUser) {
          toast.error('Este número de telefone já está cadastrado. Por favor, faça login ou use outro número.');
          setIsLogin(true); // Muda para a tela de login automaticamente
          return;
        }

        // Criar novo usuário no auth
        const { error: signUpError } = await supabase.auth.signUp({
          email: `${cleanPhone}@temp.com`,
          password: cleanPhone,
        });

        if (signUpError) throw signUpError;

        // Criar usuário na tabela users
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{ name: cleanName, phone: cleanPhone }])
          .select()
          .single();

        if (createError) throw createError;

        localStorage.setItem('user', JSON.stringify(newUser));
        toast.success('Conta criada com sucesso!');
        navigate('/');
      }
    } catch (error: any) {
      console.error('Erro:', error);
      toast.error('Ocorreu um erro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotUser = async () => {
    if (!forgotPhone) {
      toast.error('Digite seu número de telefone');
      return;
    }

    try {
      setLoading(true);
      setUserNotFound(false);

      const cleanPhone = formatPhone(forgotPhone);

      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone', cleanPhone)
        .single();

      if (error) {
        setUserNotFound(true);
        setUserData(null);
        return;
      }

      setUserData(user);
      setUserNotFound(false);
    } catch (error) {
      toast.error('Erro ao recuperar usuário');
      setUserNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <img
          src={logoImg}
          alt="Logo"
          className="mx-auto h-32 w-auto"
        />
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {isLogin ? 'Entrar no Cardápio' : 'Criar Conta'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {isLogin 
            ? 'Acesse o cardápio digital para fazer seu pedido' 
            : 'Crie sua conta para fazer pedidos'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Nome completo
              </label>
              <div className="mt-1">
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Telefone
              </label>
              <div className="mt-1">
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value, 'main')}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {loading ? 'Aguarde...' : isLogin ? 'Entrar' : 'Criar Conta'}
              </button>

              <div className="flex flex-col gap-2 text-center">
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm text-gray-600 hover:text-red-500"
                >
                  {isLogin ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Entre'}
                </button>

                {isLogin && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(true);
                      setUserData(null);
                      setUserNotFound(false);
                      setForgotPhone('');
                    }}
                    className="text-sm text-gray-600 hover:text-red-500"
                  >
                    Esqueceu seu nome?
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Modal para recuperar nome de usuário */}
      <Modal isOpen={isModalOpen} onClose={() => {
        setIsModalOpen(false);
        setUserData(null);
        setUserNotFound(false);
        setForgotPhone('');
      }}>
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {userData ? 'Dados do Usuário' : 'Recuperar Nome de Usuário'}
          </h3>

          {!userData && !userNotFound && (
            <>
              <div>
                <label htmlFor="forgotPhone" className="block text-sm font-medium text-gray-700">
                  Digite seu número de telefone
                </label>
                <input
                  id="forgotPhone"
                  type="tel"
                  value={forgotPhone}
                  onChange={(e) => handlePhoneChange(e.target.value, 'forgot')}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <button
                onClick={handleForgotUser}
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {loading ? 'Buscando...' : 'Buscar Usuário'}
              </button>
            </>
          )}

          {userNotFound && (
            <div className="text-center space-y-4">
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-red-800 font-medium">Usuário não encontrado</p>
                <p className="text-red-600 text-sm mt-1">
                  Não encontramos nenhum usuário com este número de telefone.
                </p>
              </div>
              <button
                onClick={() => {
                  setUserNotFound(false);
                  setForgotPhone('');
                }}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {userData && (
            <div className="space-y-3">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Nome</p>
                <p className="font-medium text-gray-900">{userData.name}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Telefone</p>
                <p className="font-medium text-gray-900">{userData.phone}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Data de Cadastro</p>
                <p className="font-medium text-gray-900">{formatDate(userData.created_at)}</p>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setUserData(null);
                  setUserNotFound(false);
                  setForgotPhone('');
                }}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
