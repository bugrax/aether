import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { en } from '../i18n/en';
import { tr } from '../i18n/tr';
import { usersAPI } from '../api';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { user } = useAuth();
  const [lang, setLang] = useState(() => {
    const browserLang = navigator.language || navigator.userLanguage || '';
    return browserLang.startsWith('tr') ? 'tr' : 'en';
  });
  const [aiLang, setAiLang] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      usersAPI.getSettings()
        .then(data => {
          if (data.language) setLang(data.language);
          if (data.ai_language) setAiLang(data.ai_language);
        })
        .catch(err => console.error("Failed to load settings", err))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  const t = useCallback((key) => {
    const dictionary = lang === 'tr' ? tr : en;
    return dictionary[key] || key;
  }, [lang]);

  const changeLanguage = async (newLang) => {
    try {
      if (user) await usersAPI.updateSettings({ language: newLang });
      setLang(newLang);
    } catch (err) {
      console.error("Failed to update language", err);
      setLang(newLang);
    }
  };

  const changeAiLanguage = async (newLang) => {
    try {
      if (user) await usersAPI.updateSettings({ ai_language: newLang });
      setAiLang(newLang);
    } catch (err) {
      console.error("Failed to update AI language", err);
      setAiLang(newLang);
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLanguage, aiLang, setAiLang: changeAiLanguage, t, loading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
