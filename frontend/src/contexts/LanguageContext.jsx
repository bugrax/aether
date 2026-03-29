import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { en } from '../i18n/en';
import { tr } from '../i18n/tr';
import { usersAPI } from '../api';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { user } = useAuth();
  const [lang, setLang] = useState('en');
  const [loading, setLoading] = useState(true);

  // Load language preference from API on mount
  useEffect(() => {
    if (user) {
      usersAPI.getSettings()
        .then(data => {
          if (data.language) setLang(data.language);
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
      if (user) {
        await usersAPI.updateSettings({ language: newLang });
      }
      setLang(newLang);
    } catch (err) {
      console.error("Failed to update language", err);
      // fallback just UI update
      setLang(newLang);
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLanguage, t, loading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
