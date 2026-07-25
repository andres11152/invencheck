"use client";

export const dynamic = "force-dynamic";

import React, { useState } from "react";
import { 
  ChevronRight, 
  Heart, 
  MapPin, 
  QrCode, 
  Search, 
  Sparkles, 
  User 
} from "lucide-react";
import Link from "next/link";
import { ClientProviders } from "@/components/client-providers";
import { ColsubsidioLogo } from "@/components/colsubsidio-logo";

const CATEGORIAS = [
  { id: "todos", label: "Todos" },
  { id: "salud", label: "Salud y Bienestar" },
  { id: "recreacion", label: "Hoteles y Parques" },
  { id: "educacion", label: "Educación y Cultura" },
];

const BENEFICIOS = [
  {
    id: 1,
    titulo: "PASADÍA FAMILIAR PISCILAGO",
    categoria: "recreacion",
    descuento: "HASTA 40% DTO",
    descripcion: "Disfruta del parque acuático y conservación más grande de Colombia con tarifa subsidiada según tu categoría de afiliación.",
    imagen: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=600&auto=format&fit=crop&q=80",
    tag: "Más Vendido",
  },
  {
    id: 2,
    titulo: "CONSULTA MÉDICA ESPECIALIZADA",
    categoria: "salud",
    descuento: "TARIFA PREFERENCIAL",
    descripcion: "Acceso ágil a especialidades médicas en nuestra red de Centros Médicos Colsubsidio con copagos mínimos.",
    imagen: "https://images.unsplash.com/photo-1579684389782-64d84b5e901a?w=600&auto=format&fit=crop&q=80",
    tag: "Salud Integral",
  },
  {
    id: 3,
    titulo: "DESCUENTOS EN DROGUERÍAS",
    categoria: "salud",
    descuento: "15% DTO ADICIONAL",
    descripcion: "Ahorra en medicamentos recetados y productos de cuidado personal todos los fines de semana de fin de mes.",
    imagen: "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=600&auto=format&fit=crop&q=80",
    tag: "Bienestar Diario",
  },
  {
    id: 4,
    titulo: "CURSOS CORTOS CET COLSUBSIDIO",
    categoria: "educacion",
    descuento: "BECA DEL 50%",
    descripcion: "Fórmate en habilidades digitales, gastronomía, idiomas y finanzas con certificación oficial.",
    imagen: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=600&auto=format&fit=crop&q=80",
    tag: "Educación",
  },
];

function BeneficiosPageContent() {
  const [activeTab, setActiveTab] = useState("todos");

  const beneficiosFiltrados = activeTab === "todos" 
    ? BENEFICIOS 
    : BENEFICIOS.filter((b) => b.categoria === activeTab);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased pb-12">
      {/* Carga de la Tipografía Oficial */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link 
        href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" 
        rel="stylesheet" 
      />
      <style jsx global>{`
        * {
          font-family: 'Montserrat', sans-serif !important;
        }
      `}</style>

      {/* HEADER INSTITUCIONAL */}
      <header className="sticky top-0 z-50 bg-[#0067B1] text-white shadow-md">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 hover:opacity-90">
              <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-white p-1.5 shadow-inner">
                <ColsubsidioLogo variant="color" size="sm" priority />
              </div>
              <div>
                <h1 className="text-base font-bold leading-none tracking-tight sm:text-lg">
                  Portal de Beneficios
                </h1>
                <span className="text-[10px] uppercase font-semibold text-[#FFD000] tracking-wider">
                  Colsubsidio Contigo
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors relative" aria-label="Notificaciones">
              <Sparkles className="h-5 w-5 text-[#FFD000]" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#FFD000]" />
            </button>
            <div className="flex items-center gap-2 border-l border-white/20 pl-3">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
              <span className="hidden md:inline text-xs font-medium">Hola, Ana Silva</span>
            </div>
          </div>
        </div>
      </header>

      {/* SECCIÓN HERO */}
      <section className="bg-[#0067B1] bg-gradient-to-r from-[#0067B1] to-[#1E7FC4] text-white py-10 px-4 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-[#FFD000]/15 blur-2xl" />
        <div className="absolute left-10 top-2 h-20 w-20 rounded-full bg-white/5 blur-xl" />
        
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFD000] text-[#0067B1] text-[10px] font-bold uppercase tracking-wider mb-3">
              Categoría de Afiliación: A
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 leading-tight">
              Sácale el máximo provecho a tu caja de compensación
            </h2>
            <p className="text-sm text-white/80 font-normal">
              Aquí encuentras tarifas subsidiadas en salud, recreación y educación diseñadas especialmente para ti y tu grupo familiar.
            </p>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-8">
        {/* BUSCADOR Y ACCESOS RÁPIDOS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar beneficios, convenios o servicios..." 
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0067B1] transition-all text-sm"
            />
          </div>
          <button className="flex items-center justify-center gap-2 bg-[#FFD000] text-[#0067B1] hover:bg-[#FFE266] py-3 px-6 rounded-xl font-semibold text-xs tracking-wider uppercase transition-colors shadow-sm">
            <QrCode className="h-4 w-4" />
            Mi Tarjeta Digital
          </button>
        </div>

        {/* MÓDULO DE CATEGORÍAS */}
        <div className="space-y-3">
          <h3 className="text-xs uppercase font-bold tracking-widest text-slate-400">
            Explorar Categorías
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIAS.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`px-5 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  activeTab === cat.id
                    ? "bg-[#0067B1] text-white border-transparent shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* GRILLA DE BENEFICIOS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              Destacados para ti
            </h3>
            <span className="text-xs font-semibold text-[#0067B1] hover:underline cursor-pointer">
              Ver todos ({beneficiosFiltrados.length})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {beneficiosFiltrados.map((ben) => (
              <article key={ben.id} className="group bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col md:flex-row h-full">
                <div className="relative md:w-2/5 h-44 md:h-auto overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={ben.imagen} 
                    alt={ben.titulo} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <span className="absolute top-3 left-3 bg-[#0067B1]/90 backdrop-blur-sm text-white text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-sm">
                    {ben.tag}
                  </span>
                </div>
                
                <div className="p-5 flex flex-col justify-between flex-1">
                  <div className="space-y-2">
                    <span className="text-xs font-extrabold text-[#0067B1] tracking-wide uppercase">
                      {ben.descuento}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#0067B1] transition-colors leading-tight">
                      {ben.titulo}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {ben.descripcion}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                    <button className="flex items-center gap-1 text-[11px] font-bold uppercase text-[#0067B1] tracking-wider hover:translate-x-1 transition-transform">
                      Solicitar Beneficio
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button className="p-1.5 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-[#0067B1]">
                      <Heart className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* SECCIÓN INFORMATIVA */}
        <section className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-6 justify-between">
          <div className="space-y-2 max-w-xl">
            <h3 className="text-base font-bold text-slate-900 leading-tight">
              ¿Buscas tu Centro de Servicio Colsubsidio más cercano?
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Encuentra geolocalizadas todas nuestras sedes, droguerías, hoteles, agencias de empleo y centros médicos en un solo mapa interactivo.
            </p>
          </div>
          <button className="w-full md:w-auto flex items-center justify-center gap-2 border-2 border-[#0067B1] text-[#0067B1] hover:bg-[#0067B1] hover:text-white px-6 py-3 rounded-xl font-bold text-xs tracking-wider uppercase transition-all shrink-0">
            <MapPin className="h-4 w-4" />
            Ver Mapa de Sedes
          </button>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-slate-950 text-slate-400 py-8 px-4 text-center mt-12 border-t border-slate-900">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div className="h-6 w-6 flex items-center justify-center rounded-lg bg-white/10 p-1">
              <ColsubsidioLogo variant="blanco" size="xs" />
            </div>
            <span className="text-sm font-bold text-white tracking-wider uppercase">Colsubsidio</span>
          </div>
          <p className="text-[10px] max-w-md mx-auto">
            © 2026 InvenCheck & Colsubsidio. Todos los derechos reservados. Sujeto a términos y condiciones de afiliación.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function BeneficiosPage() {
  return (
    <ClientProviders>
      <BeneficiosPageContent />
    </ClientProviders>
  );
}
