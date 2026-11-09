// Wersja aplikacji. Instalator Windows (desktop/) uruchamia serwer z OPTYK_EDITION=desktop.
// Wersja desktop: bez rejestracji, bez okresu próbnego, bez strony sprzedażowej.
export const IS_DESKTOP = process.env.OPTYK_EDITION === 'desktop';
