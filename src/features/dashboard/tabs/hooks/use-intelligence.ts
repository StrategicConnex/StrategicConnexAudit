'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/shared/lib/errors';

interface Investigation {
  id: string;
  target: string;
  targetType: string;
  score: number | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  remediation: string;
}

interface RunEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

interface Asset {
  id: string;
  type: string;
  value: string;
  metadata: Record<string, unknown>;
}

interface InvestigationDetails {
  investigation: Investigation;
  findings: Finding[];
  events: RunEvent[];
  assets: Asset[];
}

interface DriftData {
  hasDrift: boolean;
  changes: Array<{ field: string; label: string; previous: string | null; current: string | null; severity: 'critical' | 'warning' | 'info' }>;
  deltaScore: number | null;
  previousScore: number | null;
}

export function useIntelligence(selectedProjectId: string) {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [driftStates, setDriftStates] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<InvestigationDetails | null>(null);
  const [targetInput, setTargetInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string[]>([]);
  const [scanStatusMessage, setScanStatusMessage] = useState('');
  const [isGeneratingCopilot, setIsGeneratingCopilot] = useState(false);
  const [copilotOutput, setCopilotOutput] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({});
  const [elapsedTime, setElapsedTime] = useState(0);
  const [scanSpeed, setScanSpeed] = useState('0.0 KB/s');
  const [progressPercent, setProgressPercent] = useState(0);
  const [copilotStep, setCopilotStep] = useState(0);
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [driftData, setDriftData] = useState<DriftData | null>(null);
  const [showAttackSurface, setShowAttackSurface] = useState(false);
  const [showGeoMap, setShowGeoMap] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyDefaultTab, setHistoryDefaultTab] = useState<'dns' | 'whois'>('dns');

  const consoleEndRef = useRef<HTMLDivElement>(null);

  const fetchInvestigations = useCallback(async (projId: string) => {
    try {
      setErrorText(null);
      const res = await fetch(`/api/intelligence?projectId=${projId}`);
      const data = await res.json();
      if (data.success) {
        setInvestigations(data.investigations || []);
        if (data.investigations?.length > 0) {
          setSelectedId(data.investigations[0].id);
        } else {
          setSelectedId(null);
          setSelectedDetails(null);
        }
      } else {
        logger.error(data.error);
      }
    } catch (err) {
      logger.error('Error fetching investigations:', err);
    }
  }, []);

  const fetchInvestigationDetails = useCallback(async (investId: string) => {
    try {
      setErrorText(null);
      const res = await fetch(`/api/intelligence?investigationId=${investId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedDetails({
          investigation: data.investigation,
          findings: data.findings || [],
          events: data.events || [],
          assets: data.assets || [],
        });
        setCopilotOutput(null);
      } else {
        logger.error(data.error);
      }
    } catch (err) {
      logger.error('Error fetching details:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) fetchInvestigations(selectedProjectId);
  }, [selectedProjectId, fetchInvestigations]);

  useEffect(() => {
    if (selectedId) fetchInvestigationDetails(selectedId);
    else setSelectedDetails(null);
  }, [selectedId, fetchInvestigationDetails]);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scanProgress]);

  const toggleAccordion = (id: string) => {
    setExpandedAccordions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyToClipboard = (text: string, id?: string) => {
    navigator.clipboard.writeText(text);
    if (id) { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); }
    else { setCopiedIndex(true); setTimeout(() => setCopiedIndex(false), 2000); }
  };

  return {
    investigations, driftStates, selectedId, setSelectedId,
    selectedDetails, targetInput, setTargetInput,
    isScanning, scanProgress, scanStatusMessage,
    isGeneratingCopilot, copilotOutput, copiedIndex, copiedId,
    errorText, expandedAccordions, elapsedTime, scanSpeed,
    progressPercent, copilotStep, showBriefModal, driftData,
    showAttackSurface, showGeoMap, showHistory, historyDefaultTab,
    consoleEndRef,
    fetchInvestigations, toggleAccordion, handleCopyToClipboard,
    setShowBriefModal, setShowAttackSurface, setShowGeoMap,
    setShowHistory, setHistoryDefaultTab, setDriftData,
    setIsScanning, setScanProgress, setScanStatusMessage,
    setCopilotOutput, setCopilotStep, setIsGeneratingCopilot,
    setProgressPercent, setElapsedTime, setScanSpeed,
    setErrorText, setSelectedDetails,
  };
}

export type { Investigation, Finding, RunEvent, Asset, InvestigationDetails, DriftData };
