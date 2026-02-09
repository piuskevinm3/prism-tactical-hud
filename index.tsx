
import React from 'react';
import ReactDOM from 'react-dom/client';
import RootLayout from './app/layout';
import Home from './app/page';

// This file is kept as the entry point for the standard environment
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <RootLayout>
      <Home />
    </RootLayout>
  </React.StrictMode>
);
