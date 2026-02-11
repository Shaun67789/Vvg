import React from 'react';
import { CheckCircle2, Circle, Github, Upload, Settings, Rocket } from 'lucide-react';
import { Step } from '../types';

interface StepsProps {
  currentStep: Step;
}

export const Steps: React.FC<StepsProps> = ({ currentStep }) => {
  const steps = [
    { id: Step.AUTH, label: 'Connect', icon: Github },
    { id: Step.UPLOAD, label: 'Select Files', icon: Upload },
    { id: Step.CONFIG, label: 'Configure', icon: Settings },
    { id: Step.DEPLOY, label: 'Deploy', icon: Rocket },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto mb-8">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-slate-700 -z-10 rounded-full"></div>
        <div 
          className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-cyan-500 transition-all duration-500 -z-10 rounded-full"
          style={{ width: `${(Math.min(currentStep, Step.DEPLOY) / (steps.length - 1)) * 100}%` }}
        ></div>

        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isActive = currentStep >= s.id;
          const isCompleted = currentStep > s.id;

          return (
            <div key={s.id} className="flex flex-col items-center gap-2 bg-slate-900 px-2">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                ${isActive ? 'border-cyan-500 bg-slate-800 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'border-slate-600 bg-slate-900 text-slate-500'}
              `}>
                {isCompleted ? <CheckCircle2 size={20} /> : <Icon size={18} />}
              </div>
              <span className={`text-xs font-medium ${isActive ? 'text-cyan-400' : 'text-slate-500'}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
