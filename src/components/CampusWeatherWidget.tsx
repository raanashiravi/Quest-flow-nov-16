import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CloudSun,
  Sun,
  CloudRain,
  Snowflake,
  Wind,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Umbrella,
  Sparkles,
  Info,
} from 'lucide-react';

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  condition: string;
  conditionType: string;
  windSpeed: number;
  precipProb: number;
  gearAdvice: string;
  tunnelTip?: string;
  source: string;
  timestamp: string;
}

interface CampusWeatherWidgetProps {
  className?: string;
  defaultExpanded?: boolean;
}

export const CampusWeatherWidget: React.FC<CampusWeatherWidgetProps> = ({
  className = '',
  defaultExpanded = false,
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchWeather = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/weather/waterloo');
      if (res.ok) {
        const data = await res.json();
        setWeather(data);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.warn('Could not fetch Waterloo weather:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
    // Auto-refresh every 15 minutes
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Weather icon based on condition
  const getWeatherIcon = (type: string, conditionStr: string) => {
    const c = conditionStr.toLowerCase();
    const t = (type || '').toUpperCase();

    if (t === 'SNOW' || c.includes('snow') || c.includes('flurry')) {
      return <Snowflake className="w-4 h-4 text-sky-400" />;
    }
    if (t === 'RAIN' || t === 'THUNDERSTORM' || c.includes('rain') || c.includes('drizzle') || c.includes('shower')) {
      return <CloudRain className="w-4 h-4 text-blue-500" />;
    }
    if (t === 'CLEAR' || c.includes('sunny') || c.includes('clear')) {
      return <Sun className="w-4 h-4 text-amber-500" />;
    }
    if (c.includes('partly') || c.includes('scattered')) {
      return <CloudSun className="w-4 h-4 text-neutral-400" />;
    }
    return <Cloud className="w-4 h-4 text-neutral-400" />;
  };

  if (!weather && loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-xs animate-pulse ${className}`}>
        <Cloud className="w-3.5 h-3.5" />
        <span>Loading Waterloo weather...</span>
      </div>
    );
  }

  if (!weather) return null;

  return (
    <div
      className={`rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 shadow-2xs backdrop-blur-md transition-all duration-200 ${className}`}
    >
      {/* Compact Top Bar */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-left group hover:opacity-90 transition-opacity"
          title="Click to view Waterloo gear advice & campus tunnel routes"
        >
          <div className="p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 shrink-0">
            {getWeatherIcon(weather.conditionType, weather.condition)}
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-neutral-900 dark:text-white tabular-nums">
              <span>{weather.temperature}°C</span>
              <span className="text-[11px] font-normal text-neutral-500 dark:text-neutral-400">
                · {weather.condition}
              </span>
              {weather.feelsLike !== weather.temperature && (
                <span className="text-[10px] text-neutral-400 font-normal">
                  (Feels {weather.feelsLike}°C)
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate max-w-[200px] sm:max-w-xs font-medium">
              {weather.gearAdvice.split('.')[0]}.
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={fetchWeather}
            disabled={loading}
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-md transition-colors"
            title={`Refresh weather (updated ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-md transition-colors flex items-center gap-0.5 text-[10px] font-semibold"
          >
            <span className="hidden md:inline">{isExpanded ? 'Hide Advice' : 'Gear Advice'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expandable Gear Advice & Waterloo Tunnel Tips */}
      {isExpanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-neutral-100 dark:border-neutral-800/80 text-xs space-y-2.5 animate-in fade-in duration-150">
          {/* Detailed metrics row */}
          <div className="flex items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400 pt-1">
            <span className="flex items-center gap-1">
              <Wind className="w-3 h-3 text-neutral-400" />
              <span>Wind: {weather.windSpeed} km/h</span>
            </span>
            <span className="flex items-center gap-1">
              <Umbrella className="w-3 h-3 text-neutral-400" />
              <span>Precipitation: {weather.precipProb}%</span>
            </span>
            <span className="text-neutral-400">· UW Main Campus</span>
          </div>

          {/* Contextual Gear Advice Box */}
          <div className="p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/50 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100 text-[11px]">
                Recommended Walking Gear:
              </p>
              <p className="text-neutral-700 dark:text-neutral-300 text-[11px] mt-0.5 leading-relaxed">
                {weather.gearAdvice}
              </p>
            </div>
          </div>

          {/* Covered Tunnel & Bridge Tip if cold, wet, or breezy */}
          {weather.tunnelTip && (
            <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200 text-[11px]">
                  Campus Indoor Route Tip:
                </p>
                <p className="text-amber-800 dark:text-amber-300 text-[11px] mt-0.5 leading-relaxed">
                  {weather.tunnelTip}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
