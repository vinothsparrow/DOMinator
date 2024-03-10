import React from 'react';
import { useTheme } from '@root/src/shared/hooks/useTheme';
import withSuspense from '@src/shared/hoc/withSuspense';
import withErrorBoundary from '@src/shared/hoc/withErrorBoundary';
import { Button } from '@src/components/ui/button';

const Popup = () => {
  const { setTheme } = useTheme();
  return (
    <div className="bg-background p-4">
      <Button onClick={() => setTheme('light')}>Toggle theme</Button>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>);
