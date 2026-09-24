import { privatePage, privateError } from './private-page.js?v=20260921-4';
import { prepareAccount } from './prepare-account.js?v=20260921-4';
import { loadMyRoute } from './my-route.js?v=20260921-4';
import { getMyAttendances, getPassportStatus } from './attendance.js?v=20260921-4';

function getPreviewPassportCount() {
  const params = new URLSearchParams(window.location.search);

  if (!params.has('previewPassport')) {
    return null;
  }

  const parsed = Number.parseInt(params.get('previewPassport'), 10);

  return Math.min(Math.max(Number.isNaN(parsed) ? 0 : parsed, 0), 12);
}

const previewPassportCount = getPreviewPassportCount();

function getUniqueAttendances(rows = []) {
  const seen = new Set();

  return rows.filter((row) => {
    const activityId = row?.activity_id;

    if (!activityId || seen.has(activityId)) {
      return false;
    }

    seen.add(activityId);
    return true;
  });
}

function renderPassportProgress(
  attendances = [],
  passportStatus = {},
  profile = {},
  registration = {},
  previewCount = null
) {
  const uniqueAttendances = getUniqueAttendances(attendances);

  const completed = previewCount === null
    ? Math.min(uniqueAttendances.length, 12)
    : previewCount;
  const percentage = Math.round((completed / 12) * 100);
  const remaining = Math.max(0, 12 - completed);

  const countEl = document.querySelector('[data-passport-count]');
  const percentageEl = document.querySelector('[data-passport-percent]');
  const progressFill = document.querySelector('[data-passport-progress-fill]');
  const progressBar = document.querySelector('[data-passport-progressbar]');
  const progressText = document.querySelector('[data-passport-progress-text]');
  const stamps = [...document.querySelectorAll('[data-passport-stamp]')];

  if (countEl) {
    countEl.textContent = String(completed);
  }

  if (percentageEl) {
    percentageEl.textContent = `${percentage}% completado`;
  }

  if (progressBar) {
    progressBar.setAttribute('aria-valuenow', String(completed));
  }

  if (progressFill) {
    requestAnimationFrame(() => {
      progressFill.style.width = `${percentage}%`;
    });
  }

  stamps.forEach((stamp, index) => {
    const isComplete = index < completed;

    stamp.classList.toggle('is-complete', isComplete);
    stamp.setAttribute(
      'aria-label',
      isComplete
        ? `Actividad ${index + 1} completada`
        : `Actividad ${index + 1} pendiente`
    );
  });

  if (progressText) {
    if (completed >= 12) {
      progressText.textContent =
        'Meta completada. Tu insignia está desbloqueada.';
    } else {
      progressText.textContent =
        `${completed} de 12 actividades distintas con asistencia confirmada para tu insignia.`;
    }
  }

  const unlocked = completed >= 12;

  const badgeCard = document.querySelector('[data-passport-badge-card]');
  const badgeState = document.querySelector('[data-passport-badge-state]');
  const badgeCopy = document.querySelector('[data-passport-badge-copy]');
  const badgePerson = document.querySelector('[data-passport-badge-person]');
  const badgeName = document.querySelector('[data-passport-badge-name]');
  const badgeFolio = document.querySelector('[data-passport-badge-folio]');
  const badgeDateRow = document.querySelector('[data-passport-badge-date-row]');
  const badgeDate = document.querySelector('[data-passport-badge-date]');

  if (badgeCard) {
    badgeCard.classList.toggle('is-unlocked', unlocked);
  }

  if (badgeState) {
    badgeState.textContent = unlocked ? 'DESBLOQUEADA' : 'BLOQUEADA';
  }

  if (badgeCopy) {
    badgeCopy.textContent = unlocked
      ? 'Completaste 12 actividades con asistencia confirmada.'
      : `Te faltan ${remaining} ${remaining === 1 ? 'actividad' : 'actividades'} para desbloquearla.`;
  }

  const fullName =
    [profile?.nombre, profile?.apellidos]
      .filter(Boolean)
      .join(' ') || (previewCount === null ? 'Participante' : 'Usuario participante');

  if (badgeName) {
    badgeName.textContent = fullName;
  }

  if (badgeFolio) {
    badgeFolio.textContent = registration?.folio || '—';
  }

  if (badgeFolio && !registration?.folio && previewCount !== null) {
    badgeFolio.textContent = 'IMP-2026-000000';
  }

  if (badgePerson) {
    badgePerson.hidden = !unlocked;
  }

  const completionDate =
    passportStatus?.completed_at ||
    passportStatus?.badge_unlocked_at ||
    null;

  if (badgeDateRow) {
    badgeDateRow.hidden = !unlocked || !completionDate;
  }

  if (badgeDate && completionDate) {
    const date = new Date(completionDate);

    badgeDate.textContent = new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }
}

try {
  const user = await privatePage();

  if (user) {
    const {
      profile,
      registration,
      privacyRequired
    } = await prepareAccount(user);

    if (privacyRequired) {
      document.querySelector('[data-private]').hidden = true;
    } else if (!profile) {
      location.replace('mi-cuenta.html');
    } else {
      const confirmed =
        registration?.status === 'confirmed';

      const lockedSection =
        document.querySelector('#passport-locked');

      const contentSection =
        document.querySelector('#passport-content');

      if (lockedSection) {
        lockedSection.hidden = confirmed;
      }

      if (contentSection) {
        contentSection.hidden = !confirmed;
      }

      if (confirmed) {
        const previewLabel =
          document.querySelector('[data-passport-preview-label]');

        if (previewLabel) {
          previewLabel.hidden = previewPassportCount === null;
        }

        const folio =
          document.querySelector('#passport-folio');

        if (folio) {
          folio.textContent =
            registration?.folio || '—';
        }

        try {
          const [
            attendances,
            passportStatus
          ] = await Promise.all([
            getMyAttendances(),
            getPassportStatus()
          ]);

          renderPassportProgress(
            attendances,
            passportStatus,
            profile,
            registration,
            previewPassportCount
          );
        } catch (error) {
          console.error(
            'No se pudo cargar el progreso del pasaporte:',
            error
          );

          const progressText =
            document.querySelector('[data-passport-progress-text]');

          if (progressText) {
            progressText.textContent =
              'No pudimos consultar tu progreso en este momento.';
          }

          if (previewPassportCount !== null) {
            renderPassportProgress(
              [],
              {},
              profile,
              registration,
              previewPassportCount
            );
          }
        }

        await loadMyRoute();
      }
    }
  }
} catch (error) {
  privateError(error);
}
