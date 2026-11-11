'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/language-context';
import { minutesToHhmm } from '@/lib/time';

interface Business {
  id: string;
  name: string;
  phone: string | null;
  googleReviewUrl: string;
  smsProvider: string;
  smsConfig: any;
  reminderWindowStart: number;
  reminderWindowEnd: number;
  autoReminders: boolean;
}

/** „gg:mm” z pola time → minuty od północy. */
const timeToMinutes = (v: string) => {
  const [h, min] = v.split(':').map(Number);
  return h * 60 + min;
};

export default function SettingsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    googleReviewUrl: '',
    smsProvider: 'smsapi',
    smsConfig: {} as Record<string, string>,
    reminderSmsTemplate: '',
    reviewSmsTemplate: '',
    reminderWindowStart: '09:00',
    reminderWindowEnd: '17:00',
    autoReminders: false,
  });

  useEffect(() => {
    fetchBusiness();
  }, []);

  const fetchBusiness = async () => {
    try {
      const response = await fetch('/api/business');
      const data = await response.json();

      if (data.business) {
        setBusiness(data.business);
        setFormData({
          name: data.business.name,
          phone: data.business.phone || '',
          googleReviewUrl: data.business.googleReviewUrl,
          smsProvider: data.business.smsProvider || 'smsapi',
          smsConfig: data.business.smsConfig || {},
          reminderSmsTemplate: data.business.reminderSmsTemplate || '',
          reviewSmsTemplate: data.business.reviewSmsTemplate || '',
          reminderWindowStart: minutesToHhmm(data.business.reminderWindowStart ?? 540),
          reminderWindowEnd: minutesToHhmm(data.business.reminderWindowEnd ?? 1020),
          autoReminders: data.business.autoReminders ?? false,
        });
      }
    } catch (err) {
      console.error('Error fetching business:', err);
      setError(t('failedToLoadSettings'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const method = business ? 'PATCH' : 'POST';
      const response = await fetch('/api/business', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          googleReviewUrl: formData.googleReviewUrl,
          smsProvider: formData.smsProvider,
          smsConfig: formData.smsConfig,
          reminderSmsTemplate: formData.reminderSmsTemplate,
          reviewSmsTemplate: formData.reviewSmsTemplate,
          reminderWindowStart: timeToMinutes(formData.reminderWindowStart),
          reminderWindowEnd: timeToMinutes(formData.reminderWindowEnd),
          autoReminders: formData.autoReminders,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save business');
      }

      setBusiness(data.business);
      setSuccess(business ? t('businessUpdatedSuccess') : t('businessCreatedSuccess'));

      // Refresh the page data
      await fetchBusiness();
    } catch (err: any) {
      setError(err.message || 'Failed to save business');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/business', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete business');
      }

      setBusiness(null);
      setFormData({
        name: '',
        phone: '',
        googleReviewUrl: '',
        smsProvider: 'smsapi',
        smsConfig: {},
        reminderSmsTemplate: '',
        reviewSmsTemplate: '',
        reminderWindowStart: '09:00',
        reminderWindowEnd: '17:00',
        autoReminders: false,
      });
      setSuccess(t('businessDeletedSuccess'));
      setShowDeleteConfirm(false);
    } catch (err: any) {
      setError(err.message || 'Failed to delete business');
      setShowDeleteConfirm(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-b border-gray-200 pb-5">
        <h1 className="text-3xl font-bold leading-6 text-gray-900">{t('settingsTitle')}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {t('settingsSubtitle')}
        </p>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {/* Business Information */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              {t('businessInformation')}
            </h3>
            <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-4">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  {t('businessName')} *
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white"
                  placeholder="My Salon"
                />
              </div>

              <div className="sm:col-span-4">
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  {t('businessPhone')}
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white"
                  placeholder=""
                />
              </div>

              <div className="sm:col-span-6">
                <label
                  htmlFor="googleReviewUrl"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t('googleReviewUrl')} *
                </label>
                <div className="mt-1">
                  <input
                    type="url"
                    id="googleReviewUrl"
                    required
                    value={formData.googleReviewUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, googleReviewUrl: e.target.value })
                    }
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white"
                    placeholder="https://g.page/r/YOUR_PLACE/review"
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    {t('googleReviewUrlHelp')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SMS Provider Configuration */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              {t('smsConfiguration')}
            </h3>
            <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-4">
                <label htmlFor="smsProvider" className="block text-sm font-medium text-gray-700">
                  {t('smsProvider')}
                </label>
                <select
                  id="smsProvider"
                  value={formData.smsProvider}
                  onChange={(e) => setFormData({ ...formData, smsProvider: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white"
                >
                  <option value="smsapi" className="text-gray-900">SMSAPI.pl</option>
                  <option value="smsplanet" className="text-gray-900">SMSPlanet</option>
                </select>
              </div>

              {({
                smsapi: [
                  { name: 'apiKey', label: t('apiKeyToken'), type: 'password', placeholder: t('apiKeyPlaceholder') },
                  { name: 'sender', label: t('senderName'), type: 'text', maxLength: 11, placeholder: 'MySalon', hint: t('senderNameHelp') },
                ],
                smsplanet: [
                  { name: 'apiKey', label: 'Token API', type: 'password' },
                  { name: 'sender', label: 'Nazwa nadawcy', type: 'text', maxLength: 11, placeholder: 'MySalon', hint: t('senderNameHelp') },
                ],
              } as Record<string, Array<{ name: string; label: string; type: string; maxLength?: number; placeholder?: string; hint?: string }>>)[formData.smsProvider]?.map((field) => (
                <div key={field.name} className="sm:col-span-4">
                  <label htmlFor={field.name} className="block text-sm font-medium text-gray-700">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    id={field.name}
                    value={formData.smsConfig[field.name] || ''}
                    onChange={(e) => setFormData({ ...formData, smsConfig: { ...formData.smsConfig, [field.name]: e.target.value } })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white"
                    placeholder={field.placeholder}
                    maxLength={field.maxLength}
                  />
                  {field.hint && (
                    <p className="mt-2 text-sm text-gray-500">{field.hint}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SMS Templates */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              {t('smsMessageTemplates')}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {t('smsMessageTemplatesHelp')}
            </p>

            {/* Placeholders Info */}
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-3">{t('dragOrClickToInsert')}</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', '{name}');
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    const textarea = document.activeElement as HTMLTextAreaElement;
                    if (textarea?.tagName === 'TEXTAREA') {
                      const start = textarea.selectionStart;
                      const text = textarea.value;
                      const newValue = text.substring(0, start) + '{name}' + text.substring(textarea.selectionEnd);
                      if (textarea.id === 'reminderSmsTemplate') {
                        setFormData({ ...formData, reminderSmsTemplate: newValue });
                      } else if (textarea.id === 'reviewSmsTemplate') {
                        setFormData({ ...formData, reviewSmsTemplate: newValue });
                      }
                      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + 6, start + 6); }, 0);
                    }
                  }}
                  className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1.5 rounded font-mono text-xs transition-colors cursor-move border border-blue-300 active:scale-95"
                >
                  {"{name}"} <span className="text-blue-600 font-sans ml-1">- {t('customerNamePlaceholder')}</span>
                </button>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', '{link}');
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    const textarea = document.activeElement as HTMLTextAreaElement;
                    if (textarea?.tagName === 'TEXTAREA') {
                      const start = textarea.selectionStart;
                      const text = textarea.value;
                      const newValue = text.substring(0, start) + '{link}' + text.substring(textarea.selectionEnd);
                      if (textarea.id === 'reminderSmsTemplate') {
                        setFormData({ ...formData, reminderSmsTemplate: newValue });
                      } else if (textarea.id === 'reviewSmsTemplate') {
                        setFormData({ ...formData, reviewSmsTemplate: newValue });
                      }
                      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + 6, start + 6); }, 0);
                    }
                  }}
                  className="bg-green-100 hover:bg-green-200 text-green-800 px-3 py-1.5 rounded font-mono text-xs transition-colors cursor-move border border-green-300 active:scale-95"
                >
                  {"{link}"} <span className="text-green-600 font-sans ml-1">- {t('reviewLinkPlaceholder')}</span>
                </button>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', '{date}');
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    const textarea = document.activeElement as HTMLTextAreaElement;
                    if (textarea?.tagName === 'TEXTAREA') {
                      const start = textarea.selectionStart;
                      const text = textarea.value;
                      const newValue = text.substring(0, start) + '{date}' + text.substring(textarea.selectionEnd);
                      if (textarea.id === 'reminderSmsTemplate') {
                        setFormData({ ...formData, reminderSmsTemplate: newValue });
                      } else if (textarea.id === 'reviewSmsTemplate') {
                        setFormData({ ...formData, reviewSmsTemplate: newValue });
                      }
                      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + 6, start + 6); }, 0);
                    }
                  }}
                  className="bg-purple-100 hover:bg-purple-200 text-purple-800 px-3 py-1.5 rounded font-mono text-xs transition-colors cursor-move border border-purple-300 active:scale-95"
                >
                  {"{date}"} <span className="text-purple-600 font-sans ml-1">- {t('visitDatePlaceholder')}</span>
                </button>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', '{time}');
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    const textarea = document.activeElement as HTMLTextAreaElement;
                    if (textarea?.tagName === 'TEXTAREA') {
                      const start = textarea.selectionStart;
                      const text = textarea.value;
                      const newValue = text.substring(0, start) + '{time}' + text.substring(textarea.selectionEnd);
                      if (textarea.id === 'reminderSmsTemplate') {
                        setFormData({ ...formData, reminderSmsTemplate: newValue });
                      } else if (textarea.id === 'reviewSmsTemplate') {
                        setFormData({ ...formData, reviewSmsTemplate: newValue });
                      }
                      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + 6, start + 6); }, 0);
                    }
                  }}
                  className="bg-purple-100 hover:bg-purple-200 text-purple-800 px-3 py-1.5 rounded font-mono text-xs transition-colors cursor-move border border-purple-300 active:scale-95"
                >
                  {"{time}"} <span className="text-purple-600 font-sans ml-1">- {t('visitTimePlaceholder')}</span>
                </button>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', '{staff}');
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    const textarea = document.activeElement as HTMLTextAreaElement;
                    if (textarea?.tagName === 'TEXTAREA') {
                      const start = textarea.selectionStart;
                      const text = textarea.value;
                      const newValue = text.substring(0, start) + '{staff}' + text.substring(textarea.selectionEnd);
                      if (textarea.id === 'reminderSmsTemplate') {
                        setFormData({ ...formData, reminderSmsTemplate: newValue });
                      } else if (textarea.id === 'reviewSmsTemplate') {
                        setFormData({ ...formData, reviewSmsTemplate: newValue });
                      }
                      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + 7, start + 7); }, 0);
                    }
                  }}
                  className="bg-orange-100 hover:bg-orange-200 text-orange-800 px-3 py-1.5 rounded font-mono text-xs transition-colors cursor-move border border-orange-300 active:scale-95"
                >
                  {"{staff}"} <span className="text-orange-600 font-sans ml-1">- {t('businessNamePlaceholder')}</span>
                </button>
              </div>
              <p className="mt-3 text-xs text-blue-700">
                💡 {t('dragTip')}
              </p>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4">
              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="auto-reminders"
                    checked={formData.autoReminders}
                    onChange={(e) => setFormData({ ...formData, autoReminders: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-700">{t('autoRemindersLabel')}</span>
                    <span className="block text-sm text-gray-500">{t(formData.autoReminders ? 'autoRemindersOnHelp' : 'autoRemindersOffHelp')}</span>
                  </span>
                </label>
              </div>

              {formData.autoReminders && (
              <div>
                <span className="block text-sm font-medium text-gray-700">{t('reminderWindowLabel')}</span>
                <div className="mt-1 flex items-center gap-3">
                  <label htmlFor="reminderWindowStart" className="text-sm text-gray-600">{t('reminderWindowFrom')}</label>
                  <input
                    id="reminderWindowStart"
                    type="time"
                    required
                    value={formData.reminderWindowStart}
                    onChange={(e) => setFormData({ ...formData, reminderWindowStart: e.target.value })}
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white"
                  />
                  <label htmlFor="reminderWindowEnd" className="text-sm text-gray-600">{t('reminderWindowTo')}</label>
                  <input
                    id="reminderWindowEnd"
                    type="time"
                    required
                    value={formData.reminderWindowEnd}
                    onChange={(e) => setFormData({ ...formData, reminderWindowEnd: e.target.value })}
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white"
                  />
                </div>
                <p className="mt-2 text-sm text-gray-500">{t('reminderWindowHelp')}</p>
              </div>
              )}

              <div>
                <label htmlFor="reminderSmsTemplate" className="block text-sm font-medium text-gray-700">
                  {t('reminderSmsTemplateLabel')}
                </label>
                <textarea
                  id="reminderSmsTemplate"
                  rows={3}
                  value={formData.reminderSmsTemplate}
                  onChange={(e) => setFormData({ ...formData, reminderSmsTemplate: e.target.value })}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('ring-2', 'ring-blue-400');
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('ring-2', 'ring-blue-400');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('ring-2', 'ring-blue-400');
                    const placeholder = e.dataTransfer.getData('text/plain');
                    const textarea = e.currentTarget;
                    const start = textarea.selectionStart;
                    const text = textarea.value;
                    const newValue = text.substring(0, start) + placeholder + text.substring(textarea.selectionEnd);
                    setFormData({ ...formData, reminderSmsTemplate: newValue });
                    setTimeout(() => {
                      textarea.focus();
                      textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
                    }, 0);
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white transition-all"
                  placeholder="Cześć {name}! Przypominamy o wizycie w dniu {date}. Pozdrawiamy, {staff}"
                />
                <p className="mt-2 text-sm text-gray-500">
                  {t('reminderSmsTemplateHelp')}
                </p>
              </div>

              <div>
                <label htmlFor="reviewSmsTemplate" className="block text-sm font-medium text-gray-700">
                  {t('reviewSmsTemplateLabel')}
                </label>
                <textarea
                  id="reviewSmsTemplate"
                  rows={4}
                  value={formData.reviewSmsTemplate}
                  onChange={(e) => setFormData({ ...formData, reviewSmsTemplate: e.target.value })}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('ring-2', 'ring-blue-400');
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('ring-2', 'ring-blue-400');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('ring-2', 'ring-blue-400');
                    const placeholder = e.dataTransfer.getData('text/plain');
                    const textarea = e.currentTarget;
                    const start = textarea.selectionStart;
                    const text = textarea.value;
                    const newValue = text.substring(0, start) + placeholder + text.substring(textarea.selectionEnd);
                    setFormData({ ...formData, reviewSmsTemplate: newValue });
                    setTimeout(() => {
                      textarea.focus();
                      textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
                    }, 0);
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white transition-all"
                  placeholder="Cześć {name}! Dziękujemy za wizytę. Zostaw nam swoją opinię: {link} - {staff}"
                />
                <p className="mt-2 text-sm text-gray-500">
                  {t('reviewSmsTemplateHelp')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between">
          <div>
            {business && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {t('deleteBusiness')}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSaving ? t('saving') : business ? t('updateBusiness') : t('createBusiness')}
            </button>
          </div>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">{t('confirmDelete')}</h3>
            <p className="text-sm text-gray-500 mb-6">
              {t('confirmDeleteBusinessMessage')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={isSaving}
                className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isSaving ? t('deleting') : t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
