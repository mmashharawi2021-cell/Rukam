import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './earth-theme.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
